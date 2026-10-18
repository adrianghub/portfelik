/**
 * Local integration: handler → createUser → registry → generateLink → verifyOtp.
 * Loopback Supabase only. Never logs tokenHash / session material.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createOpenDemoAccountHandler,
  type DemoProvisionClient,
} from "../../../../supabase/functions/open-demo-account/handler";
import {
  assertLocalSupabaseUrl,
  createAdminClient,
  createAnonClient,
} from "./setup";

const createdUserIds: string[] = [];

function asProvisionClient(
  client: ReturnType<typeof createAdminClient>
): DemoProvisionClient {
  return client as unknown as DemoProvisionClient;
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
    for (const id of createdUserIds) {
      await admin.from("demo_identities").delete().eq("user_id", id);
      await admin.from("demo_provision_orphans").delete().eq("user_id", id);
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
    });
    expect(denied.error).not.toBeNull();

    const first = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 3600,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
    });
    expect(first.error).toBeNull();
    const second = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 3600,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
    });
    expect(second.error).toBeNull();
    const third = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: key,
      p_window_seconds: 3600,
      p_max_per_window: 2,
      p_global_max_active: 10_000,
    });
    expect(third.error?.message ?? "").toMatch(/demo_rate_limited/);

    // Parallel surplus attempts must not exceed the window max.
    const burstKey = `burst-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.rpc("claim_demo_provision_slot", {
          p_client_key: burstKey,
          p_window_seconds: 3600,
          p_max_per_window: 3,
          p_global_max_active: 10_000,
        })
      )
    );
    const ok = results.filter((r) => !r.error).length;
    const limited = results.filter((r) =>
      (r.error?.message ?? "").includes("demo_rate_limited")
    ).length;
    expect(ok).toBe(3);
    expect(limited).toBe(5);
  });

  it("handler issues verifyOtp session for a confirmed demo identity only", async () => {
    const handle = createOpenDemoAccountHandler(
      (name) => {
        const map: Record<string, string> = {
          SUPABASE_URL: url,
          SUPABASE_SERVICE_ROLE_KEY: serviceKey,
          DEMO_PROVISION_ENABLED: "true",
          DEMO_PROVISION_RATE_MAX: "50",
          DEMO_PROVISION_RATE_WINDOW_SECONDS: "60",
          DEMO_PROVISION_GLOBAL_MAX_ACTIVE: "10000",
          DEMO_PROVISION_CLIENT_SALT: "integration-test",
        };
        return map[name];
      },
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

    const response = await handle(
      new Request("http://127.0.0.1/open-demo-account", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
          "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 200)}`,
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

    // Response must not look like a session; token material stays in JSON only.
    expect(payload.access_token).toBeUndefined();
    expect(payload.email).toMatch(/@demo\.jakstoimy\.local$/);
    expect(payload.verifyType).toBe("email");
    expect(typeof payload.tokenHash).toBe("string");
    expect(payload.tokenHash.length).toBeGreaterThan(10);

    const admin = createAdminClient();
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

    // Replay denied.
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
  });
});
