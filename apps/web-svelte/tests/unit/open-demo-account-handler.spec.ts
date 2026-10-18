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
    const req = post({}, {
      "x-forwarded-for": "203.0.113.9",
      "x-real-ip": "198.51.100.7",
      "cf-connecting-ip": "192.0.2.1",
    });
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

  it("releases reservation and never deletes on foreign Auth identity", async () => {
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
    expect(rpc).toHaveBeenCalledWith("release_demo_provision_reservation", {
      p_reservation_id: RESERVATION_ID,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "register_demo_identity",
      expect.anything()
    );
  });

  it("refuses ownership when getUserById fails (no createUser fallback)", async () => {
    getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "read failed" },
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("release_demo_provision_reservation", {
      p_reservation_id: RESERVATION_ID,
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("releases reservation after owned cleanup when register fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") {
        return { data: RESERVATION_ID, error: null };
      }
      if (name === "renew_demo_provision_reservation") return { data: null, error: null };
      if (name === "register_demo_identity") {
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
    expect(rpc).toHaveBeenCalledWith("release_demo_provision_reservation", {
      p_reservation_id: RESERVATION_ID,
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

  it("fails closed when reservation expires before registry write", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_demo_provision_slot") {
        return { data: RESERVATION_ID, error: null };
      }
      if (name === "renew_demo_provision_reservation") {
        return { data: null, error: { message: "reservation_not_held" } };
      }
      if (name === "release_demo_provision_reservation") {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(rpc).not.toHaveBeenCalledWith(
      "register_demo_identity",
      expect.anything()
    );
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
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
