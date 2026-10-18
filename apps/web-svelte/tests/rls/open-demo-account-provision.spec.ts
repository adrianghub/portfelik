/**
 * Local integration: handler → createUser → registry → generateLink → verifyOtp.
 * Loopback Supabase only. Never logs tokenHash / session material.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  SHARED_CLIENT_KEY_MATERIAL,
  createOpenDemoAccountHandler,
  resolveClientKeyMaterial,
  type DemoProvisionClient,
} from "../../../../supabase/functions/open-demo-account/handler";
import {
  assertLocalSupabaseUrl,
  createAdminClient,
  createAnonClient,
} from "./setup";

const createdUserIds: string[] = [];
const reservationIds: string[] = [];

function asProvisionClient(
  client: ReturnType<typeof createAdminClient>
): DemoProvisionClient {
  return client as unknown as DemoProvisionClient;
}

async function activeDemoCount(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { count, error } = await admin
    .from("demo_identities")
    .select("user_id", { count: "exact", head: true })
    .is("retired_at", null);
  if (error) throw error;
  return count ?? 0;
}

function makeHandler(env: Record<string, string>) {
  return createOpenDemoAccountHandler(
    (name) => env[name],
    (u, k, opts) =>
      asProvisionClient(
        createClient(u, k, {
          auth: {
            persistSession: opts.auth.persistSession,
            autoRefreshToken: opts.auth.autoRefreshToken,
          },
        })
      ),
    { randomUUID }
  );
}

describe("B2 open-demo-account provision integration", () => {
  let url: string;
  let anonKey: string;
  let serviceKey: string;

  beforeAll(() => {
    url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!;
    anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY!;
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    assertLocalSupabaseUrl(url);
  });

  afterAll(async () => {
    const admin = createAdminClient();
    for (const id of reservationIds) {
      await admin.rpc("release_demo_provision_reservation", {
        p_reservation_id: id,
      });
    }
    for (const id of createdUserIds) {
      await admin.from("demo_identities").delete().eq("user_id", id);
      await admin.from("demo_provision_orphans").delete().eq("user_id", id);
      await admin.from("demo_provision_reservations").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("claim_demo_provision_slot is service_role only and rate-limits atomically", async () => {
    const admin = createAdminClient();
    const anon = createAnonClient();
    const key = `itest-${randomUUID()}`;

    const denied = await anon.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 60,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
      p_hold_seconds: 30,
    });
    expect(denied.error).not.toBeNull();

    const first = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 3600,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
      p_hold_seconds: 30,
    });
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("string");
    reservationIds.push(first.data as string);

    const second = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 3600,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
      p_hold_seconds: 30,
    });
    expect(second.error).toBeNull();
    reservationIds.push(second.data as string);

    const third = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 3600,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
      p_hold_seconds: 30,
    });
    expect(third.error?.message ?? "").toMatch(/demo_rate_limited/);

    const burstKey = `burst-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.rpc("claim_demo_provision_slot", {
          p_client_key: burstKey,
          p_window_seconds: 3600,
          p_max_per_window: 3,
          p_global_max_active: 10_000,
          p_hold_seconds: 30,
        })
      )
    );
    const ok = results.filter((r) => !r.error);
    const limited = results.filter((r) =>
      (r.error?.message ?? "").includes("demo_rate_limited")
    );
    expect(ok).toHaveLength(3);
    expect(limited).toHaveLength(5);
    for (const row of ok) reservationIds.push(row.data as string);
  });

  it("global capacity counts in-flight holds — parallel claims cannot overshoot", async () => {
    const admin = createAdminClient();
    await admin.rpc("expire_demo_provision_reservations");
    for (const id of [...reservationIds]) {
      await admin.rpc("release_demo_provision_reservation", {
        p_reservation_id: id,
      });
    }
    reservationIds.length = 0;

    const baseline = await activeDemoCount(admin);
    const cap = baseline + 1;
    const prefix = `cap-${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        admin.rpc("claim_demo_provision_slot", {
          p_client_key: `${prefix}-${i}`,
          p_window_seconds: 3600,
          p_max_per_window: 50,
          p_global_max_active: cap,
          p_hold_seconds: 120,
        })
      )
    );

    const held = results.filter((r) => !r.error);
    const exhausted = results.filter((r) =>
      (r.error?.message ?? "").includes("demo_capacity_exhausted")
    );
    expect(held).toHaveLength(1);
    expect(exhausted).toHaveLength(7);
    reservationIds.push(held[0]!.data as string);

    // A second wave while the hold is live must also be denied.
    const again = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: `${prefix}-extra`,
      p_window_seconds: 3600,
      p_max_per_window: 50,
      p_global_max_active: cap,
      p_hold_seconds: 120,
    });
    expect(again.error?.message ?? "").toMatch(/demo_capacity_exhausted/);
  });

  it("parallel handlers respect global cap after full provisioning completes", async () => {
    const admin = createAdminClient();
    // Free leftover holds from prior cases so this test starts clean.
    await admin.rpc("expire_demo_provision_reservations");
    for (const id of [...reservationIds]) {
      await admin.rpc("release_demo_provision_reservation", {
        p_reservation_id: id,
      });
    }
    reservationIds.length = 0;

    const baseline = await activeDemoCount(admin);
    const cap = baseline + 1;
    const handle = makeHandler({
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      DEMO_PROVISION_ENABLED: "true",
      DEMO_PROVISION_RATE_MAX: "100",
      DEMO_PROVISION_RATE_WINDOW_SECONDS: "60",
      DEMO_PROVISION_GLOBAL_MAX_ACTIVE: String(cap),
      DEMO_PROVISION_HOLD_SECONDS: "120",
      DEMO_PROVISION_CLIENT_SALT: `parallel-${randomUUID()}`,
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        handle(
          new Request("http://127.0.0.1/open-demo-account", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "http://127.0.0.1:5173",
              // Spoofed headers must not create separate buckets.
              "x-forwarded-for": `${Math.floor(Math.random() * 200)}.0.0.1`,
              "x-real-ip": `${Math.floor(Math.random() * 200)}.0.0.2`,
            },
            body: "{}",
          })
        )
      )
    );

    const statuses = await Promise.all(
      responses.map(async (response) => {
        const body = (await response.json()) as {
          userId?: string;
          error?: string;
          tokenHash?: string;
        };
        if (response.status === 200 && body.userId) {
          createdUserIds.push(body.userId);
        }
        return { status: response.status, error: body.error, userId: body.userId };
      })
    );

    const succeeded = statuses.filter((s) => s.status === 200);
    const capacityDenied = statuses.filter(
      (s) => s.status === 503 && s.error === "capacity_exhausted"
    );
    expect(succeeded).toHaveLength(1);
    expect(capacityDenied.length + succeeded.length).toBe(5);
    expect(await activeDemoCount(admin)).toBe(baseline + 1);
  });

  it("header spoofing cannot escape the shared client bucket", () => {
    const a = new Request("http://x", {
      headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" },
    });
    const b = new Request("http://x", {
      headers: { "x-forwarded-for": "9.9.9.9", "cf-connecting-ip": "8.8.8.8" },
    });
    expect(resolveClientKeyMaterial(a, undefined).material).toBe(
      SHARED_CLIENT_KEY_MATERIAL
    );
    expect(resolveClientKeyMaterial(b, undefined).material).toBe(
      SHARED_CLIENT_KEY_MATERIAL
    );
    expect(resolveClientKeyMaterial(a, "x-forwarded-for").material).toBe(
      SHARED_CLIENT_KEY_MATERIAL
    );
  });

  it("handler issues verifyOtp session for a confirmed demo identity only", async () => {
    const admin = createAdminClient();
    await admin.rpc("expire_demo_provision_reservations");
    const handle = makeHandler({
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      DEMO_PROVISION_ENABLED: "true",
      DEMO_PROVISION_RATE_MAX: "50",
      DEMO_PROVISION_RATE_WINDOW_SECONDS: "60",
      DEMO_PROVISION_GLOBAL_MAX_ACTIVE: "10000",
      DEMO_PROVISION_CLIENT_SALT: "integration-test",
    });

    const response = await handle(
      new Request("http://127.0.0.1/open-demo-account", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
        },
        body: "{}",
      })
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      userId: string;
      email: string;
      tokenHash: string;
      verifyType: string;
      access_token?: string;
    };
    createdUserIds.push(payload.userId);

    expect(payload.access_token).toBeUndefined();
    expect(payload.email).toMatch(/@demo\.jakstoimy\.local$/);
    expect(payload.verifyType).toBe("email");
    expect(typeof payload.tokenHash).toBe("string");
    expect(payload.tokenHash.length).toBeGreaterThan(10);

    const demo = await admin.rpc("is_demo_account", { p_user_id: payload.userId });
    expect(demo.data).toBe(true);

    const session = await createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: "email",
    });
    expect(session.error).toBeNull();
    expect(session.data.session?.user.id).toBe(payload.userId);
    expect(session.data.user?.app_metadata?.account_kind).toBe("demo");

    const replay = await createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: "email",
    });
    expect(replay.error).toBeTruthy();
    expect(replay.data.session).toBeNull();
  });

  it("authenticated clients cannot write provision tables", async () => {
    const admin = createAdminClient();
    const password = process.env.RLS_TEST_PASSWORD!;
    const email = `rls-prov-${randomUUID()}@example.test`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    createdUserIds.push(userId);

    const login = await createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${login.data.session!.access_token}` },
      },
    });

    const attempt = await userClient.from("demo_provision_attempts").insert({
      client_key: "forged",
    });
    expect(attempt.error).not.toBeNull();
    const orphan = await userClient.from("demo_provision_orphans").insert({
      user_id: userId,
      email: "x@demo.jakstoimy.local",
      provision_nonce: "n",
    });
    expect(orphan.error).not.toBeNull();
    const reservation = await userClient.from("demo_provision_reservations").insert({
      client_key: "forged",
      status: "held",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(reservation.error).not.toBeNull();
  });
});
