import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmOwnedDemoIdentity,
  createOpenDemoAccountHandler,
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

const post = (body?: unknown, origin = "https://localhost") =>
  new Request("https://edge.test/open-demo-account", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
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
  uuidSeq = [
    "11111111-1111-4111-8111-111111111111", // email uuid
    NONCE, // provision nonce
  ];
  config = {
    SUPABASE_URL: "https://db.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-test",
    DEMO_PROVISION_ENABLED: "true",
    DEMO_PROVISION_RATE_MAX: "5",
  };
  createUser.mockResolvedValue({
    data: { user: ownedUser() },
    error: null,
  });
  getUserById.mockResolvedValue({
    data: { user: ownedUser() },
    error: null,
  });
  deleteUser.mockResolvedValue({ error: null });
  rpc.mockImplementation(async (name: string) => {
    if (name === "claim_demo_provision_slot") return { data: null, error: null };
    if (name === "register_demo_identity") return { data: null, error: null };
    if (name === "is_demo_account") return { data: true, error: null };
    if (name === "record_demo_provision_orphan") return { data: null, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "token-hash-secret" } },
    error: null,
  });
});

describe("confirmOwnedDemoIdentity", () => {
  it("accepts only matching email + demo claim + nonce", () => {
    expect(
      confirmOwnedDemoIdentity(DEMO_EMAIL, NONCE, ownedUser())
    ).toEqual({
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
    expect(
      confirmOwnedDemoIdentity(DEMO_EMAIL, NONCE, {
        id: "x",
        email: DEMO_EMAIL,
        app_metadata: { account_kind: "demo", demo_provision_nonce: "other" },
      })
    ).toBeNull();
  });
});

describe("open-demo-account Edge handler", () => {
  it("returns 503 when DEMO_PROVISION_ENABLED is not true", async () => {
    config.DEMO_PROVISION_ENABLED = "false";
    const response = await handler()(post());
    expect(response.status).toBe(503);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied email or user id", async () => {
    expect((await handler()(post({ email: "attacker@example.com" }))).status).toBe(
      400
    );
    expect((await handler()(post({ userId: "existing" }))).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("provisions only after registry verification and returns token hash", async () => {
    const response = await handler()(post({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      userId: "demo-uid",
      email: DEMO_EMAIL,
      tokenHash: "token-hash-secret",
      verifyType: "email",
    });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: DEMO_EMAIL,
        app_metadata: {
          account_kind: "demo",
          demo_provision_nonce: NONCE,
        },
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      "claim_demo_provision_slot",
      expect.objectContaining({ p_client_key: expect.stringContaining("hash:") })
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes only confirmed owned orphans when register fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") return { data: null, error: null };
      if (name === "register_demo_identity") {
        return { data: null, error: { message: "boom" } };
      }
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(getUserById).toHaveBeenCalledWith("demo-uid");
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("refuses token and never deletes when Auth returns a real identity", async () => {
    const foreign = {
      id: "real-uid",
      email: "real.user@example.com",
      app_metadata: { account_kind: "real" },
    };
    createUser.mockResolvedValue({ data: { user: foreign }, error: null });
    getUserById.mockResolvedValue({ data: { user: foreign }, error: null });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "provision_failed" });
    expect(body).not.toHaveProperty("tokenHash");
    expect(generateLink).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(getUserById).toHaveBeenCalledWith("real-uid");
    expect(rpc).not.toHaveBeenCalledWith(
      "register_demo_identity",
      expect.anything()
    );
  });

  it("refuses delete when cleanup re-fetch no longer matches ownership", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") return { data: null, error: null };
      if (name === "register_demo_identity") {
        return { data: null, error: { message: "boom" } };
      }
      return { data: null, error: null };
    });
    getUserById.mockResolvedValue({
      data: {
        user: {
          id: "demo-uid",
          email: "someone-else@example.com",
          app_metadata: { account_kind: "demo", demo_provision_nonce: NONCE },
        },
      },
      error: null,
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("ledgers orphan when owned deleteUser fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") return { data: null, error: null };
      if (name === "register_demo_identity") {
        return { data: null, error: { message: "boom" } };
      }
      if (name === "record_demo_provision_orphan") return { data: null, error: null };
      return { data: null, error: null };
    });
    deleteUser.mockResolvedValue({ error: { message: "delete blew up" } });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenCalledWith("record_demo_provision_orphan", {
      p_user_id: "demo-uid",
      p_email: DEMO_EMAIL,
      p_nonce: NONCE,
      p_error: "delete blew up",
    });
  });

  it("maps durable rate limit and capacity errors", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "demo_rate_limited" },
    });
    const limited = await handler()(post());
    expect(limited.status).toBe(429);
    expect(createUser).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "demo_capacity_exhausted" },
    });
    const full = await handler()(post());
    expect(full.status).toBe(503);
    expect(await full.json()).toEqual({ error: "capacity_exhausted" });
  });

  it("rejects automation when Turnstile secret is configured without token", async () => {
    config.DEMO_TURNSTILE_SECRET = "turnstile-secret";
    const response = await handler()(post({}));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "automation_rejected" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not return a session object", async () => {
    const response = await handler()(post());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.access_token).toBeUndefined();
    expect(body.refresh_token).toBeUndefined();
    expect(body.session).toBeUndefined();
  });

  it("on createUser failure returns no token and never registers", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "create failed" },
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenCalledWith(
      "claim_demo_provision_slot",
      expect.anything()
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "register_demo_identity",
      expect.anything()
    );
    expect(generateLink).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
