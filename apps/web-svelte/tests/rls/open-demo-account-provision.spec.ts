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
import { assertLocalSupabaseUrl, createAdminClient, createAnonClient } from "./setup";

const createdUserIds: string[] = [];
const reservationIds: string[] = [];

function asProvisionClient(client: ReturnType<typeof createAdminClient>): DemoProvisionClient {
  return client as unknown as DemoProvisionClient;
}

async function activeDemoCount(admin: ReturnType<typeof createAdminClient>): Promise<number> {
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
    const limited = results.filter((r) => (r.error?.message ?? "").includes("demo_rate_limited"));
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

  function trackedClient(admin: ReturnType<typeof createAdminClient>) {
    const base = asProvisionClient(admin);
    const users: { id: string; email: string }[] = [];
    const client: DemoProvisionClient = {
      rpc: (name, args) => base.rpc(name, args),
      auth: {
        admin: {
          createUser: async (input) => {
            const result = await base.auth.admin.createUser(input);
            if (result.data.user) {
              users.push({ id: result.data.user.id, email: input.email });
              createdUserIds.push(result.data.user.id);
            }
            return result;
          },
          getUserById: (id) => base.auth.admin.getUserById(id),
          deleteUser: (id) => base.auth.admin.deleteUser(id),
          generateLink: (input) => base.auth.admin.generateLink(input),
        },
      },
    };
    return { client, users };
  }

  function injectedHandler(client: DemoProvisionClient, cap: number) {
    const env: Record<string, string> = {
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      DEMO_PROVISION_ENABLED: "true",
      DEMO_PROVISION_RATE_MAX: "10000",
      DEMO_PROVISION_GLOBAL_MAX_ACTIVE: String(cap),
      DEMO_PROVISION_CLIENT_SALT: randomUUID(),
    };
    return createOpenDemoAccountHandler(
      (name) => env[name],
      () => client,
      { randomUUID }
    );
  }

  const openRequest = () =>
    new Request("http://127.0.0.1/open-demo-account", {
      method: "POST",
      body: "{}",
    });

  async function operationFor(admin: ReturnType<typeof createAdminClient>, email: string) {
    const result = await admin
      .from("demo_provision_reservations")
      .select("*")
      .eq("email", email)
      .single();
    expect(result.error).toBeNull();
    reservationIds.push(result.data!.id);
    return result.data!;
  }

  it.each([false, true])(
    "Auth read + ledger failure retains durable operation (throw=%s)",
    async (throws) => {
      const admin = createAdminClient();
      const { client, users } = trackedClient(admin);
      const baseRpc = client.rpc;
      client.auth.admin.getUserById = async () => {
        if (throws) throw new Error("injected transport failure");
        return { data: { user: null }, error: { message: "injected read failure" } };
      };
      client.rpc = async (name, args) => {
        if (name === "record_demo_provision_orphan") {
          if (throws) throw new Error("injected ledger transport failure");
          return { data: null, error: { message: "injected ledger failure" } };
        }
        return baseRpc(name, args);
      };
      const baseline = await activeDemoCount(admin);
      const response = await injectedHandler(client, baseline + 1)(openRequest());
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty("tokenHash");
      expect(users).toHaveLength(1);
      const op = await operationFor(admin, users[0].email);
      expect(op.status).toBe("creating");
      expect(op.provision_nonce).toBeTruthy();
      expect((await admin.auth.admin.getUserById(users[0].id)).data.user?.id).toBe(users[0].id);
      expect(
        (
          await admin.rpc("claim_demo_provision_slot", {
            p_client_key: randomUUID(),
            p_global_max_active: baseline + 1,
          })
        ).error?.message
      ).toContain("demo_capacity_exhausted");
      expect(
        (
          await admin.rpc("confirm_demo_provision_identity", {
            p_reservation_id: op.id,
            p_user_id: users[0].id,
          })
        ).error
      ).toBeNull();
      expect((await admin.auth.admin.deleteUser(users[0].id)).error).toBeNull();
      expect(
        (
          await admin.rpc("complete_demo_provision_cleanup", {
            p_reservation_id: op.id,
            p_user_id: users[0].id,
          })
        ).error
      ).toBeNull();
    }
  );

  it("deleteUser failure writes real ledger and both RPC arities resolve", async () => {
    const admin = createAdminClient();
    const { client, users } = trackedClient(admin);
    client.auth.admin.generateLink = async () => ({
      data: null,
      error: { message: "injected link failure" },
    });
    client.auth.admin.deleteUser = async () => ({ error: { message: "injected delete failure" } });
    expect((await injectedHandler(client, 10000)(openRequest())).status).toBe(500);
    const op = await operationFor(admin, users[0].email);
    const ledger = await admin
      .from("demo_provision_orphans")
      .select("kind")
      .eq("user_id", users[0].id)
      .single();
    expect(ledger.error).toBeNull();
    expect(ledger.data?.kind).toBe("owned_delete_failed");
    const args = {
      p_user_id: users[0].id,
      p_email: users[0].email,
      p_nonce: op.provision_nonce,
      p_error: "probe",
    };
    expect((await admin.rpc("record_demo_provision_orphan", args)).error).toBeNull();
    expect(
      (
        await admin.rpc("record_demo_provision_orphan", {
          ...args,
          p_kind: "unconfirmed_auth_read",
        })
      ).error
    ).toBeNull();
    expect((await admin.auth.admin.deleteUser(users[0].id)).error).toBeNull();
    expect(
      (
        await admin.rpc("complete_demo_provision_cleanup", {
          p_reservation_id: op.id,
          p_user_id: users[0].id,
        })
      ).error
    ).toBeNull();
  });

  it("expired operation plus failed cleanup blocks concurrent Auth creation at cap=1", async () => {
    const admin = createAdminClient();
    const { client, users } = trackedClient(admin);
    const baseline = await activeDemoCount(admin);
    let signalReady!: () => void;
    let finishFirst!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const finish = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const baseRpc = client.rpc;
    client.rpc = async (name, args) => {
      if (name === "commit_demo_provision_reservation") {
        const forced = await admin
          .from("demo_provision_reservations")
          .update({ expires_at: new Date(Date.now() - 5000).toISOString() })
          .eq("id", args!.p_reservation_id);
        expect(forced.error).toBeNull();
        signalReady();
        await finish;
        return { data: null, error: { message: "injected finalization failure" } };
      }
      return baseRpc(name, args);
    };
    client.auth.admin.deleteUser = async () => ({ error: { message: "injected delete failure" } });
    const handle = injectedHandler(client, baseline + 1);
    const first = handle(openRequest());
    await ready;
    try {
      expect((await admin.rpc("expire_demo_provision_reservations")).error).toBeNull();
      const concurrent = await Promise.all(Array.from({ length: 5 }, () => handle(openRequest())));
      for (const response of concurrent) {
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "capacity_exhausted" });
      }
    } finally {
      finishFirst();
    }
    expect((await first).status).toBe(500);
    expect(users).toHaveLength(1);
    const op = await operationFor(admin, users[0].email);
    expect(op.status).toBe("creating");
    expect(
      (await admin.rpc("release_demo_provision_reservation", { p_reservation_id: op.id })).error
    ).toBeNull();
    expect(
      (
        await admin.rpc("complete_demo_provision_cleanup", {
          p_reservation_id: op.id,
          p_user_id: users[0].id,
        })
      ).error?.message
    ).toContain("cleanup_auth_still_exists");
    expect((await handle(openRequest())).status).toBe(503);
    expect((await admin.auth.admin.deleteUser(users[0].id)).error).toBeNull();
    expect(
      (
        await admin.rpc("complete_demo_provision_cleanup", {
          p_reservation_id: op.id,
          p_user_id: users[0].id,
        })
      ).error
    ).toBeNull();
  });

  it("atomic commit validates operation ownership and keeps expired creating capacity", async () => {
    const admin = createAdminClient();
    const email = `demo+atomic-${randomUUID()}@demo.jakstoimy.local`;
    const nonce = randomUUID();
    const slot = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: randomUUID(),
      p_global_max_active: 10000,
    });
    expect(slot.error).toBeNull();
    reservationIds.push(slot.data as string);
    expect(
      (
        await admin.rpc("begin_demo_provision_operation", {
          p_reservation_id: slot.data,
          p_email: email,
          p_nonce: nonce,
        })
      ).error
    ).toBeNull();
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { account_kind: "demo", demo_provision_nonce: nonce },
    });
    expect(created.error).toBeNull();
    const uid = created.data.user!.id;
    createdUserIds.push(uid);
    expect(
      (
        await admin.rpc("commit_demo_provision_reservation", {
          p_reservation_id: slot.data,
          p_user_id: randomUUID(),
        })
      ).error?.message
    ).toContain("operation_identity_mismatch");
    expect((await admin.rpc("is_demo_account", { p_user_id: uid })).data).toBe(true); // app_metadata also denies privileges
    expect((await admin.from("demo_identities").select("user_id").eq("user_id", uid)).data).toEqual(
      []
    );
    await admin
      .from("demo_provision_reservations")
      .update({ expires_at: new Date(Date.now() - 5000).toISOString() })
      .eq("id", slot.data);
    expect(
      (
        await admin.rpc("commit_demo_provision_reservation", {
          p_reservation_id: slot.data,
          p_user_id: uid,
        })
      ).error
    ).toBeNull();
    expect(
      (await admin.from("demo_identities").select("user_id").eq("user_id", uid).single()).data
        ?.user_id
    ).toBe(uid);
    expect(
      (
        await admin
          .from("demo_provision_reservations")
          .select("status")
          .eq("id", slot.data)
          .single()
      ).data?.status
    ).toBe("committed");
  });

  it("orphan without an operation still consumes capacity", async () => {
    const admin = createAdminClient();
    const uid = randomUUID();
    const baseline = await activeDemoCount(admin);
    try {
      expect(
        (
          await admin.rpc("record_demo_provision_orphan", {
            p_user_id: uid,
            p_email: `demo+${randomUUID()}@demo.jakstoimy.local`,
            p_nonce: randomUUID(),
            p_error: "legacy unresolved operation",
          })
        ).error
      ).toBeNull();
      expect(
        (
          await admin.rpc("claim_demo_provision_slot", {
            p_client_key: randomUUID(),
            p_global_max_active: baseline + 1,
          })
        ).error?.message
      ).toContain("demo_capacity_exhausted");
    } finally {
      await admin.from("demo_provision_orphans").delete().eq("user_id", uid);
    }
  });

  it("expired pre-Auth hold cannot become an operation", async () => {
    const admin = createAdminClient();
    const slot = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: randomUUID(),
      p_global_max_active: 10000,
    });
    expect(slot.error).toBeNull();
    reservationIds.push(slot.data as string);
    await admin
      .from("demo_provision_reservations")
      .update({ expires_at: new Date(Date.now() - 5000).toISOString() })
      .eq("id", slot.data);
    expect(
      (
        await admin.rpc("begin_demo_provision_operation", {
          p_reservation_id: slot.data,
          p_email: `demo+${randomUUID()}@demo.jakstoimy.local`,
          p_nonce: randomUUID(),
        })
      ).error?.message
    ).toContain("reservation_not_held");
  });

  it("header spoofing cannot escape the shared client bucket", () => {
    const a = new Request("http://x", {
      headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" },
    });
    const b = new Request("http://x", {
      headers: { "x-forwarded-for": "9.9.9.9", "cf-connecting-ip": "8.8.8.8" },
    });
    expect(resolveClientKeyMaterial(a, undefined).material).toBe(SHARED_CLIENT_KEY_MATERIAL);
    expect(resolveClientKeyMaterial(b, undefined).material).toBe(SHARED_CLIENT_KEY_MATERIAL);
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
    for (const caller of [userClient, createAnonClient()]) {
      for (const [name, args] of [
        [
          "begin_demo_provision_operation",
          {
            p_reservation_id: randomUUID(),
            p_email: "demo+denied@demo.jakstoimy.local",
            p_nonce: randomUUID(),
          },
        ],
        [
          "commit_demo_provision_reservation",
          { p_reservation_id: randomUUID(), p_user_id: userId },
        ],
        ["confirm_demo_provision_identity", { p_reservation_id: randomUUID(), p_user_id: userId }],
        ["complete_demo_provision_cleanup", { p_reservation_id: randomUUID(), p_user_id: userId }],
        [
          "record_demo_provision_orphan",
          {
            p_user_id: userId,
            p_email: "demo+denied@demo.jakstoimy.local",
            p_nonce: randomUUID(),
            p_error: "denied",
          },
        ],
        [
          "record_demo_provision_orphan",
          {
            p_user_id: userId,
            p_email: "demo+denied@demo.jakstoimy.local",
            p_nonce: randomUUID(),
            p_error: "denied",
            p_kind: "unconfirmed_auth_read",
          },
        ],
      ] as const) {
        expect((await caller.rpc(name, args)).error).not.toBeNull();
      }
      for (const table of ["demo_provision_reservations", "demo_provision_orphans"]) {
        const read = await caller.from(table).select("*");
        expect(read.error !== null || read.data?.length === 0).toBe(true);
      }
    }
  });
});
