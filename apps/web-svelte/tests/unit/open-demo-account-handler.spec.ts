import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARED_CLIENT_KEY_MATERIAL,
  confirmOwnedDemoIdentity,
  createOpenDemoAccountHandler,
  resolveClientKeyMaterial,
  type DemoProvisionClient,
} from "../../../../supabase/functions/open-demo-account/handler";

const createUser = vi.fn();
const getUserById = vi.fn();
const deleteUser = vi.fn();
const generateLink = vi.fn();
const rpc = vi.fn();

const client: DemoProvisionClient = {
  rpc,
  auth: {
    admin: {
      createUser,
      getUserById,
      deleteUser,
      generateLink,
    },
  },
};

let config: Record<string, string>;
let uuidSeq: string[];
const handler = () =>
  createOpenDemoAccountHandler(
    (name) => config[name],
    () => client,
    {
      randomUUID: () => uuidSeq.shift() ?? "00000000-0000-4000-8000-000000000099",
      sha256Hex: async (value) => `hash:${value}`,
    }
  );

const DEMO_EMAIL = "demo+11111111-1111-4111-8111-111111111111@demo.jakstoimy.local";
const NONCE = "22222222-2222-4222-8222-222222222222";
const RESERVATION_ID = "33333333-3333-4333-8333-333333333333";

const post = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("https://edge.test/open-demo-account", {
    method: "POST",
    headers: {
      origin: "https://localhost",
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function ownedUser(
  overrides: {
    id?: string;
    email?: string | null;
    app_metadata?: Record<string, unknown>;
  } = {}
) {
  const { app_metadata, ...rest } = overrides;
  return {
    id: "demo-uid",
    email: DEMO_EMAIL,
    ...rest,
    app_metadata: {
      account_kind: "demo",
      demo_provision_nonce: NONCE,
      ...app_metadata,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidSeq = ["11111111-1111-4111-8111-111111111111", NONCE];
  config = {
    SUPABASE_URL: "https://db.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-test",
    DEMO_PROVISION_ENABLED: "true",
    DEMO_PROVISION_RATE_MAX: "5",
  };
  createUser.mockResolvedValue({ data: { user: ownedUser() }, error: null });
  getUserById.mockResolvedValue({ data: { user: ownedUser() }, error: null });
  deleteUser.mockResolvedValue({ error: null });
  rpc.mockImplementation(async (name: string) => {
    if (name === "claim_demo_provision_slot") {
      return { data: RESERVATION_ID, error: null };
    }
    if (name === "begin_demo_provision_operation") return { data: null, error: null };
    if (name === "confirm_demo_provision_identity") return { data: null, error: null };
    if (name === "complete_demo_provision_cleanup") return { data: null, error: null };
    if (name === "renew_demo_provision_reservation") return { data: null, error: null };
    if (name === "register_demo_identity") return { data: null, error: null };
    if (name === "is_demo_account") return { data: true, error: null };
    if (name === "commit_demo_provision_reservation") return { data: null, error: null };
    if (name === "release_demo_provision_reservation") return { data: null, error: null };
    if (name === "record_demo_provision_orphan") return { data: null, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "token-hash-secret" } },
    error: null,
  });
});

describe("resolveClientKeyMaterial", () => {
  it("ignores spoofable IP headers by default (shared bucket)", () => {
    const req = post(
      {},
      {
        "x-forwarded-for": "203.0.113.9",
        "x-real-ip": "198.51.100.7",
        "cf-connecting-ip": "192.0.2.1",
      }
    );
    expect(resolveClientKeyMaterial(req, undefined)).toEqual({
      material: SHARED_CLIENT_KEY_MATERIAL,
      trusted: false,
    });
  });

  it("refuses known-spoofable headers even when misconfigured as trusted", () => {
    const req = post({}, { "x-forwarded-for": "203.0.113.9" });
    expect(resolveClientKeyMaterial(req, "x-forwarded-for")).toEqual({
      material: SHARED_CLIENT_KEY_MATERIAL,
      trusted: false,
    });
    expect(resolveClientKeyMaterial(req, "x-real-ip")).toEqual({
      material: SHARED_CLIENT_KEY_MATERIAL,
      trusted: false,
    });
  });

  it("accepts only an explicitly allowlisted non-spoofable header name", () => {
    const req = post({}, { "sb-test-trusted-ip": "203.0.113.50" });
    expect(resolveClientKeyMaterial(req, "sb-test-trusted-ip")).toEqual({
      material: "203.0.113.50",
      trusted: true,
    });
  });
});

describe("confirmOwnedDemoIdentity", () => {
  it("accepts only matching email + demo claim + nonce", () => {
    expect(confirmOwnedDemoIdentity(DEMO_EMAIL, NONCE, ownedUser())).toEqual({
      userId: "demo-uid",
      email: DEMO_EMAIL,
      provisionNonce: NONCE,
    });
    expect(
      confirmOwnedDemoIdentity(DEMO_EMAIL, NONCE, {
        id: "x",
        email: "real@example.com",
        app_metadata: { account_kind: "demo", demo_provision_nonce: NONCE },
      })
    ).toBeNull();
  });
});

describe("open-demo-account Edge handler", () => {
  it("keeps the master kill switch in explicitly persistent staging", async () => {
    Object.assign(config, {
      SUPABASE_URL: "https://nveyzxxnyccpnesebvuw.supabase.co",
      DEMO_STAGING_ALWAYS_ENABLED: "true",
      DEMO_PROVISION_ENABLED: "false",
      DEMO_PROVISION_REQUIRE_TURNSTILE: "true",
      DEMO_TURNSTILE_SECRET: "test-secret",
      DEMO_PROVISION_CLIENT_SALT: "test-salt",
      DEMO_PROVISION_RATE_WINDOW_SECONDS: "7200",
      DEMO_PROVISION_RATE_MAX: "3",
      DEMO_PROVISION_GLOBAL_MAX_ACTIVE: "3",
    });
    const response = await handler()(post());
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });
  it("refuses staging with enabled=true but no server lease", async () => {
    config.SUPABASE_URL = "https://nveyzxxnyccpnesebvuw.supabase.co";
    const response = await handler()(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_provision_disabled" });
    expect(rpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("does not start Auth when an in-flight begin RPC crosses staging expiry", async () => {
    const started = Date.now();
    Object.assign(config, {
      SUPABASE_URL: "https://nveyzxxnyccpnesebvuw.supabase.co",
      DEMO_SOAK_STARTED_AT: new Date(started).toISOString(),
      DEMO_SOAK_EXPIRES_AT: new Date(started + 3_600_000).toISOString(),
      DEMO_PROVISION_REQUIRE_TURNSTILE: "true",
      DEMO_TURNSTILE_SECRET: "test-secret",
      DEMO_PROVISION_CLIENT_SALT: "test-salt",
      DEMO_PROVISION_RATE_WINDOW_SECONDS: "7200",
      DEMO_PROVISION_RATE_MAX: "3",
      DEMO_PROVISION_GLOBAL_MAX_ACTIVE: "3",
    });
    const clock = vi.spyOn(Date, "now").mockReturnValue(started);
    const normalRpc = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "begin_demo_provision_operation") clock.mockReturnValue(started + 3_600_000);
      return normalRpc(name, args);
    });
    const handle = createOpenDemoAccountHandler(
      (name) => config[name],
      () => client,
      {
        randomUUID: () => uuidSeq.shift()!,
        sha256Hex: async () => "shared-test-key",
        fetchFn: async () => new Response(JSON.stringify({ success: true })),
      }
    );
    try {
      const response = await handle(post({ turnstileToken: "test-token" }));
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty("tokenHash");
      expect(createUser).not.toHaveBeenCalled();
      expect(generateLink).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
    } finally {
      clock.mockRestore();
    }
  });

  it.each(["read", "confirm", "delete", "complete"])(
    "cleanup fails closed on %s failure",
    async (stage) => {
      generateLink.mockResolvedValue({ data: null, error: { message: "link unavailable" } });
      if (stage === "read") {
        getUserById.mockResolvedValueOnce({ data: { user: ownedUser() }, error: null });
        getUserById.mockRejectedValueOnce(new Error("Auth read unavailable"));
      }
      if (stage === "delete") deleteUser.mockRejectedValue(new Error("Auth delete unavailable"));
      const normalRpc = rpc.getMockImplementation()!;
      rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
        if (
          (stage === "confirm" && name === "confirm_demo_provision_identity") ||
          (stage === "complete" && name === "complete_demo_provision_cleanup")
        ) {
          throw new Error("journal unavailable");
        }
        return normalRpc(name, args);
      });
      const response = await handler()(post({}));
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty("tokenHash");
      expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
      if (stage === "read" || stage === "confirm") expect(deleteUser).not.toHaveBeenCalled();
      if (stage !== "complete")
        expect(rpc).not.toHaveBeenCalledWith("complete_demo_provision_cleanup", expect.anything());
    }
  );

  it("persists ownership before deleting and releases only after successful delete", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "link unavailable" } });
    expect((await handler()(post({}))).status).toBe(500);
    const callOrder = (name: string) =>
      rpc.mock.invocationCallOrder[rpc.mock.calls.findIndex(([n]) => n === name)];
    expect(callOrder("confirm_demo_provision_identity")).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0]
    );
    expect(callOrder("complete_demo_provision_cleanup")).toBeGreaterThan(
      deleteUser.mock.invocationCallOrder[0]
    );
    expect(rpc).toHaveBeenCalledWith("confirm_demo_provision_identity", {
      p_reservation_id: RESERVATION_ID,
      p_user_id: "demo-uid",
    });
  });
  it("journals invented identity before Auth and never directly registers", async () => {
    const response = await handler()(post({}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(rpc).toHaveBeenCalledWith("begin_demo_provision_operation", {
      p_reservation_id: RESERVATION_ID,
      p_email: DEMO_EMAIL,
      p_nonce: NONCE,
    });
    const beginIndex = rpc.mock.calls.findIndex(
      ([name]) => name === "begin_demo_provision_operation"
    );
    expect(rpc.mock.invocationCallOrder[beginIndex]).toBeLessThan(
      createUser.mock.invocationCallOrder[0]
    );
    expect(rpc).not.toHaveBeenCalledWith("register_demo_identity", expect.anything());
    expect(generateLink.mock.invocationCallOrder[0]).toBeGreaterThan(
      rpc.mock.invocationCallOrder[
        rpc.mock.calls.findIndex(([name]) => name === "commit_demo_provision_reservation")
      ]
    );
  });

  it.each([false, true])(
    "retains operation on Auth read + ledger failure (throw=%s)",
    async (throws) => {
      getUserById.mockImplementation(async () => {
        if (throws) throw new Error("transport failure");
        return { data: { user: null }, error: { message: "Auth unavailable" } };
      });
      const normalRpc = rpc.getMockImplementation()!;
      rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
        if (name === "record_demo_provision_orphan") {
          if (throws) throw new Error("ledger transport failure");
          return { data: null, error: { message: "ledger unavailable" } };
        }
        return normalRpc(name, args);
      });
      const response = await handler()(post({}));
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty("tokenHash");
      expect(rpc).toHaveBeenCalledWith(
        "record_demo_provision_orphan",
        expect.objectContaining({ p_user_id: "demo-uid", p_kind: "unconfirmed_auth_read" })
      );
      expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
      expect(rpc).not.toHaveBeenCalledWith("complete_demo_provision_cleanup", expect.anything());
      expect(deleteUser).not.toHaveBeenCalled();
    }
  );

  it("retains capacity when createUser throws with an unknown outcome", async () => {
    createUser.mockRejectedValue(new Error("transport failure"));
    expect((await handler()(post({}))).status).toBe(500);
    expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("retains an owned operation if Auth fails again during cleanup", async () => {
    getUserById.mockResolvedValueOnce({ data: { user: ownedUser() }, error: null });
    getUserById.mockRejectedValueOnce(new Error("cleanup read unavailable"));
    generateLink.mockResolvedValue({ data: null, error: { message: "link unavailable" } });
    expect((await handler()(post({}))).status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "record_demo_provision_orphan",
      expect.objectContaining({ p_kind: "unconfirmed_auth_read" })
    );
    expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("complete_demo_provision_cleanup", expect.anything());
  });

  it("records explicit orphan kind after delete failure without releasing capacity", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "link unavailable" } });
    deleteUser.mockResolvedValue({ error: { message: "delete unavailable" } });
    expect((await handler()(post({}))).status).toBe(500);
    expect(rpc).toHaveBeenCalledWith(
      "record_demo_provision_orphan",
      expect.objectContaining({ p_kind: "owned_delete_failed" })
    );
    expect(rpc).not.toHaveBeenCalledWith("complete_demo_provision_cleanup", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
  });

  it("does not delete when cleanup re-read has a mismatched UID", async () => {
    getUserById.mockResolvedValueOnce({ data: { user: ownedUser() }, error: null });
    getUserById.mockResolvedValueOnce({
      data: { user: ownedUser({ id: "foreign-uid" }) },
      error: null,
    });
    generateLink.mockResolvedValue({ data: null, error: { message: "link unavailable" } });
    expect((await handler()(post({}))).status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("returns 503 when DEMO_PROVISION_ENABLED is not true", async () => {
    config.DEMO_PROVISION_ENABLED = "false";
    expect((await handler()(post())).status).toBe(503);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("spoofed x-forwarded-for does not create a distinct rate-limit key", async () => {
    await handler()(post({}, { "x-forwarded-for": "1.1.1.1" }));
    await handler()(post({}, { "x-forwarded-for": "2.2.2.2" }));
    const keys = rpc.mock.calls
      .filter(([name]) => name === "claim_demo_provision_slot")
      .map(([, args]) => (args as { p_client_key: string }).p_client_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain(`hash:local-dev-salt:${SHARED_CLIENT_KEY_MATERIAL}`);
  });

  it("provisions after ownership + commits reservation", async () => {
    const response = await handler()(post({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      userId: "demo-uid",
      email: DEMO_EMAIL,
      tokenHash: "token-hash-secret",
    });
    expect(rpc).toHaveBeenCalledWith("commit_demo_provision_reservation", {
      p_reservation_id: RESERVATION_ID,
      p_user_id: "demo-uid",
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("retains capacity and never deletes on foreign Auth identity", async () => {
    const foreign = {
      id: "real-uid",
      email: "real.user@example.com",
      app_metadata: { account_kind: "real" },
    };
    createUser.mockResolvedValue({ data: { user: foreign }, error: null });
    getUserById.mockResolvedValue({ data: { user: foreign }, error: null });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "record_demo_provision_orphan",
      expect.objectContaining({
        p_user_id: "real-uid",
        p_kind: "unconfirmed_auth_read",
        p_error: "provision_cleanup_unresolved",
      })
    );
    expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("register_demo_identity", expect.anything());
  });

  it("refuses ownership when getUserById fails and ledgers unconfirmed UID", async () => {
    getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "read failed" },
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("record_demo_provision_orphan", {
      p_user_id: "demo-uid",
      p_email: DEMO_EMAIL,
      p_nonce: NONCE,
      p_error: "provision_cleanup_unresolved",
      p_kind: "unconfirmed_auth_read",
    });
    expect(rpc).not.toHaveBeenCalledWith("release_demo_provision_reservation", expect.anything());
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("releases capacity only after owned cleanup when atomic commit fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") {
        return { data: RESERVATION_ID, error: null };
      }
      if (name === "renew_demo_provision_reservation") return { data: null, error: null };
      if (name === "commit_demo_provision_reservation") {
        return { data: null, error: { message: "boom" } };
      }
      if (name === "release_demo_provision_reservation") {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
    expect(rpc).toHaveBeenCalledWith("complete_demo_provision_cleanup", {
      p_reservation_id: RESERVATION_ID,
      p_user_id: "demo-uid",
    });
  });

  it("maps durable rate limit and capacity errors", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "demo_rate_limited" },
    });
    expect((await handler()(post())).status).toBe(429);

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "demo_capacity_exhausted" },
    });
    expect((await handler()(post())).status).toBe(503);
  });

  it("rejects automation when Turnstile is required", async () => {
    config.DEMO_PROVISION_REQUIRE_TURNSTILE = "true";
    const response = await handler()(post({}));
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails before Auth when reservation expires before durable operation starts", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") {
        return { data: RESERVATION_ID, error: null };
      }
      if (name === "begin_demo_provision_operation") {
        return { data: null, error: { message: "reservation_not_held" } };
      }
      if (name === "release_demo_provision_reservation") {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(rpc).not.toHaveBeenCalledWith("register_demo_identity", expect.anything());
    expect(createUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("does not return a token when commit_demo_provision_reservation fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") {
        return { data: RESERVATION_ID, error: null };
      }
      if (name === "renew_demo_provision_reservation") return { data: null, error: null };
      if (name === "register_demo_identity") return { data: null, error: null };
      if (name === "is_demo_account") return { data: true, error: null };
      if (name === "commit_demo_provision_reservation") {
        return { data: null, error: { message: "reservation_not_held" } };
      }
      if (name === "release_demo_provision_reservation") {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "provision_failed" });
    expect(body).not.toHaveProperty("tokenHash");
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
  });
});
