import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "./setup";
import {
  createOpenDemoAccountHandler,
  type DemoProvisionClient,
} from "../../../../supabase/functions/open-demo-account/handler";

// Loopback is enforced by setup.ts. Teardown touches only this test's manifest.
const operations: string[] = [];
const users: string[] = [];

afterEach(async () => {
  const admin = createAdminClient();
  for (const uid of users.splice(0)) {
    await admin.auth.admin.deleteUser(uid);
    await admin.from("demo_provision_orphans").delete().eq("user_id", uid);
  }
  for (const id of operations.splice(0)) {
    await admin.from("demo_provision_reservations").delete().eq("id", id);
  }
});

async function fixture() {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("demo_identities")
    .select("user_id", { head: true, count: "exact" })
    .is("retired_at", null);
  expect(error).toBeNull();
  const cap = (count ?? 0) + 1;
  const slot = await admin.rpc("claim_demo_provision_slot", {
    p_client_key: randomUUID(),
    p_global_max_active: cap,
  });
  expect(slot.error).toBeNull();
  const id = slot.data as string;
  operations.push(id);
  const email = `demo+state-${randomUUID()}@demo.jakstoimy.local`;
  const nonce = randomUUID();
  const args = { p_reservation_id: id, p_email: email, p_nonce: nonce };
  const state = async () => {
    const row = await admin
      .from("demo_provision_reservations")
      .select("status,user_id")
      .eq("id", id)
      .single();
    expect(row.error).toBeNull();
    return row.data!;
  };
  const begin = () => admin.rpc("begin_demo_provision_operation", args);
  const create = async (overrides: { email?: string; kind?: string; nonce?: string } = {}) => {
    const created = await admin.auth.admin.createUser({
      email: overrides.email ?? email,
      email_confirm: true,
      app_metadata: {
        account_kind: overrides.kind ?? "demo",
        demo_provision_nonce: overrides.nonce ?? nonce,
      },
    });
    expect(created.error).toBeNull();
    const uid = created.data.user!.id;
    users.push(uid);
    return uid;
  };
  const confirm = (uid: string) =>
    admin.rpc("confirm_demo_provision_identity", { p_reservation_id: id, p_user_id: uid });
  const complete = (uid: string | null) =>
    admin.rpc("complete_demo_provision_cleanup", { p_reservation_id: id, p_user_id: uid });
  return { admin, id, email, nonce, cap, args, begin, create, confirm, complete, state };
}

describe("demo provision state machine", () => {
  it.each(["held", "released"])("rejects cleanup/confirmation/commit from %s", async (status) => {
    const f = await fixture();
    if (status === "released") {
      expect(
        (await f.admin.rpc("release_demo_provision_reservation", { p_reservation_id: f.id })).error
      ).toBeNull();
      expect((await f.begin()).error).not.toBeNull();
    }
    const uid = randomUUID();
    expect((await f.confirm(uid)).error).not.toBeNull();
    expect((await f.complete(uid)).error).not.toBeNull();
    expect(
      (
        await f.admin.rpc("commit_demo_provision_reservation", {
          p_reservation_id: f.id,
          p_user_id: uid,
        })
      ).error
    ).not.toBeNull();
    expect((await f.state()).status).toBe(status);
  });

  it("NULL UID rejects NULL, nonexistent and foreign UIDs, even after a 404", async () => {
    const f = await fixture();
    expect((await f.begin()).error).toBeNull();
    const missing = randomUUID();
    expect((await f.admin.auth.admin.getUserById(missing)).error).not.toBeNull();
    const foreign = await f.create({ email: `foreign-${randomUUID()}@example.test`, kind: "real" });
    for (const uid of [null, missing, foreign])
      expect((await f.complete(uid)).error?.message).toContain("invalid_cleanup_operation");
    expect((await f.confirm(missing)).error?.message).toContain("operation_identity_mismatch");
    expect((await f.confirm(foreign)).error?.message).toContain("operation_identity_mismatch");
    expect(await f.state()).toEqual({ status: "creating", user_id: null });
    expect(
      (await f.admin.auth.admin.getUserById(foreign)).data.user?.app_metadata.account_kind
    ).toBe("real");
  });

  it.each(["email", "nonce", "account_kind"])(
    "does not bind a UID with mismatched %s",
    async (field) => {
      const f = await fixture();
      expect((await f.begin()).error).toBeNull();
      const uid = await f.create(
        field === "email"
          ? { email: `foreign-${randomUUID()}@example.test` }
          : field === "nonce"
            ? { nonce: randomUUID() }
            : { kind: "real" }
      );
      expect((await f.confirm(uid)).error?.message).toContain("operation_identity_mismatch");
      expect((await f.complete(uid)).error?.message).toContain("invalid_cleanup_operation");
      expect(await f.state()).toEqual({ status: "creating", user_id: null });
      expect((await f.admin.auth.admin.getUserById(uid)).data.user?.id).toBe(uid);
    }
  );

  it.each(["creating", "committed"])(
    "releases %s only after binding the exact owned UID and successful deletion",
    async (status) => {
      const f = await fixture();
      expect((await f.begin()).error).toBeNull();
      const uid = await f.create();
      expect((await f.confirm(uid)).error).toBeNull();
      expect((await f.confirm(uid)).error).toBeNull(); // idempotent, never rebind
      expect((await f.confirm(randomUUID())).error?.message).toContain(
        "invalid_identity_confirmation"
      );
      if (status === "committed")
        expect(
          (
            await f.admin.rpc("commit_demo_provision_reservation", {
              p_reservation_id: f.id,
              p_user_id: uid,
            })
          ).error
        ).toBeNull();
      expect((await f.complete(uid)).error?.message).toContain("cleanup_auth_still_exists");
      expect((await f.begin()).error).not.toBeNull(); // no second create for this operation
      expect((await f.admin.auth.admin.deleteUser(uid)).error).toBeNull();
      expect((await f.complete(randomUUID())).error?.message).toContain(
        "invalid_cleanup_operation"
      );
      expect((await f.state()).status).toBe(status);
      expect((await f.complete(uid)).error).toBeNull();
      expect(await f.state()).toEqual({ status: "released", user_id: uid });
      expect((await f.complete(uid)).error).not.toBeNull();
      expect((await f.begin()).error).not.toBeNull();
      const next = await f.admin.rpc("claim_demo_provision_slot", {
        p_client_key: randomUUID(),
        p_global_max_active: f.cap,
      });
      expect(next.error).toBeNull();
      operations.push(next.data as string);
    }
  );

  it("commit cannot rebind a confirmed UID even if Auth email/nonce is recreated", async () => {
    const f = await fixture();
    expect((await f.begin()).error).toBeNull();
    const original = await f.create();
    expect((await f.confirm(original)).error).toBeNull();
    expect((await f.admin.auth.admin.deleteUser(original)).error).toBeNull();
    const replacement = await f.create();
    expect(replacement).not.toBe(original);
    expect((await f.confirm(replacement)).error?.message).toContain(
      "invalid_identity_confirmation"
    );
    expect(
      (
        await f.admin.rpc("commit_demo_provision_reservation", {
          p_reservation_id: f.id,
          p_user_id: replacement,
        })
      ).error?.message
    ).toContain("invalid_identity_confirmation");
    expect(await f.state()).toEqual({ status: "creating", user_id: original });
    expect((await f.complete(original)).error?.message).toContain("cleanup_auth_still_exists");
    expect(
      (await f.admin.from("demo_identities").select("user_id").eq("user_id", replacement)).data
    ).toEqual([]);
  });

  it("registration failure rolls back commit and its binding without releasing capacity", async () => {
    const f = await fixture();
    expect((await f.begin()).error).toBeNull();
    const uid = await f.create();
    expect(
      (await f.admin.from("profiles").update({ role: "admin" }).eq("id", uid)).error
    ).toBeNull();
    expect(
      (
        await f.admin.rpc("commit_demo_provision_reservation", {
          p_reservation_id: f.id,
          p_user_id: uid,
        })
      ).error?.message
    ).toContain("demo_has_real_entitlements");
    expect(await f.state()).toEqual({ status: "creating", user_id: null });
    expect(
      (await f.admin.from("demo_identities").select("user_id").eq("user_id", uid)).data
    ).toEqual([]);
    expect((await f.complete(uid)).error?.message).toContain("invalid_cleanup_operation");
    expect(
      (
        await f.admin.rpc("claim_demo_provision_slot", {
          p_client_key: randomUUID(),
          p_global_max_active: f.cap,
        })
      ).error?.message
    ).toContain("demo_capacity_exhausted");
  });

  function forwardingClient(admin: ReturnType<typeof createAdminClient>) {
    const base = admin as unknown as DemoProvisionClient;
    const client: DemoProvisionClient = {
      rpc: async (name, args) => {
        const result = await base.rpc(name, args);
        if (name === "claim_demo_provision_slot" && !result.error)
          operations.push(result.data as string);
        return result;
      },
      auth: {
        admin: {
          createUser: async (args) => {
            const result = await base.auth.admin.createUser(args);
            if (result.data.user) users.push(result.data.user.id);
            return result;
          },
          getUserById: (id) => base.auth.admin.getUserById(id),
          deleteUser: (id) => base.auth.admin.deleteUser(id),
          generateLink: (args) => base.auth.admin.generateLink(args),
        },
      },
    };
    return client;
  }

  function handler(client: DemoProvisionClient, cap: number) {
    const env: Record<string, string> = {
      SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      DEMO_PROVISION_ENABLED: "true",
      DEMO_PROVISION_GLOBAL_MAX_ACTIVE: String(cap),
      DEMO_PROVISION_RATE_MAX: "10000",
      DEMO_PROVISION_CLIENT_SALT: randomUUID(),
    };
    return createOpenDemoAccountHandler(
      (name) => env[name],
      () => client,
      { randomUUID }
    );
  }
  const request = () =>
    new Request("http://127.0.0.1/open-demo-account", { method: "POST", body: "{}" });

  it.each([false, true])(
    "delayed Auth create + reconciliation cannot free cap=baseline+1 (cleanupFails=%s)",
    async (cleanupFails) => {
      const admin = createAdminClient();
      const { count } = await admin
        .from("demo_identities")
        .select("user_id", { count: "exact", head: true })
        .is("retired_at", null);
      const cap = (count ?? 0) + 1;
      const client = forwardingClient(admin);
      const create = client.auth.admin.createUser;
      let ready!: () => void;
      let resume!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        resume = resolve;
      });
      let creates = 0;
      client.auth.admin.createUser = async (args) => {
        creates++;
        if (creates === 1) {
          ready();
          await pending;
        }
        return create(args);
      };
      if (cleanupFails) {
        const rpc = client.rpc;
        client.rpc = async (name, args) =>
          name === "commit_demo_provision_reservation"
            ? { data: null, error: { message: "injected commit failure" } }
            : rpc(name, args);
        client.auth.admin.deleteUser = async () => ({
          error: { message: "injected delete failure" },
        });
      }
      const handle = handler(client, cap);
      const first = handle(request());
      await started;
      const id = operations[0];
      try {
        await admin
          .from("demo_provision_reservations")
          .update({ expires_at: new Date(Date.now() - 5000).toISOString() })
          .eq("id", id);
        expect((await admin.rpc("expire_demo_provision_reservations")).error).toBeNull();
        const nonexistent = randomUUID();
        expect((await admin.auth.admin.getUserById(nonexistent)).error).not.toBeNull();
        expect(
          (
            await admin.rpc("complete_demo_provision_cleanup", {
              p_reservation_id: id,
              p_user_id: nonexistent,
            })
          ).error?.message
        ).toContain("invalid_cleanup_operation");
        expect(
          (
            await admin.rpc("confirm_demo_provision_identity", {
              p_reservation_id: id,
              p_user_id: nonexistent,
            })
          ).error
        ).not.toBeNull();
        expect(
          (await admin.rpc("release_demo_provision_reservation", { p_reservation_id: id })).error
        ).toBeNull();
        for (const response of await Promise.all(
          Array.from({ length: 5 }, () => handle(request()))
        )) {
          expect(response.status).toBe(503);
          expect(await response.json()).toEqual({ error: "capacity_exhausted" });
        }
        expect(creates).toBe(1);
        const op = await admin
          .from("demo_provision_reservations")
          .select("status,user_id")
          .eq("id", id)
          .single();
        expect(op.data).toEqual({ status: "creating", user_id: null });
      } finally {
        resume();
      }
      const response = await first;
      expect(response.status).toBe(cleanupFails ? 500 : 200);
      if (cleanupFails) {
        expect(await response.json()).not.toHaveProperty("tokenHash");
        expect((await handle(request())).status).toBe(503);
      }
      expect(users).toHaveLength(1);
      expect((await admin.auth.admin.getUserById(users[0])).data.user?.id).toBe(users[0]);
    }
  );

  it.each(["confirm", "complete"])(
    "journal %s failure during handler cleanup retains capacity",
    async (stage) => {
      const admin = createAdminClient();
      const { count } = await admin
        .from("demo_identities")
        .select("user_id", { count: "exact", head: true })
        .is("retired_at", null);
      const cap = (count ?? 0) + 1;
      const client = forwardingClient(admin);
      client.auth.admin.generateLink = async () => ({
        data: null,
        error: { message: "injected link failure" },
      });
      const rpc = client.rpc;
      client.rpc = async (name, args) =>
        name ===
        (stage === "confirm"
          ? "confirm_demo_provision_identity"
          : "complete_demo_provision_cleanup")
          ? { data: null, error: { message: "injected journal failure" } }
          : rpc(name, args);
      const handle = handler(client, cap);
      const response = await handle(request());
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty("tokenHash");
      expect((await handle(request())).status).toBe(503);
      const op = await admin
        .from("demo_provision_reservations")
        .select("status,user_id")
        .eq("id", operations[0])
        .single();
      expect(op.data).toEqual({ status: "committed", user_id: users[0] });
      const auth = await admin.auth.admin.getUserById(users[0]);
      if (stage === "confirm") expect(auth.data.user?.id).toBe(users[0]);
      else expect(auth.error).not.toBeNull();
    }
  );
});
