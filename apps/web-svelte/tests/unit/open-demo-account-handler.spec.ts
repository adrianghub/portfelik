import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpenDemoAccountHandler,
  resetDemoProvisionRateLimitForTests,
  type DemoProvisionClient,
} from "../../../../supabase/functions/open-demo-account/handler";

const createUser = vi.fn();
const deleteUser = vi.fn();
const generateLink = vi.fn();
const rpc = vi.fn();

const client: DemoProvisionClient = {
  rpc,
  auth: {
    admin: {
      createUser,
      deleteUser,
      generateLink,
      updateUserById: vi.fn(),
    },
  },
};

let config: Record<string, string>;
const handler = () =>
  createOpenDemoAccountHandler(
    (name) => config[name],
    () => client,
    { randomUUID: () => "11111111-1111-4111-8111-111111111111" }
  );

const post = (body?: unknown, origin = "https://localhost") =>
  new Request("https://edge.test/open-demo-account", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetDemoProvisionRateLimitForTests();
  config = {
    SUPABASE_URL: "https://db.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-test",
    DEMO_PROVISION_ENABLED: "true",
    DEMO_PROVISION_RATE_MAX: "100",
  };
  createUser.mockResolvedValue({
    data: { user: { id: "demo-uid", email: "demo+11111111-1111-4111-8111-111111111111@demo.jakstoimy.local" } },
    error: null,
  });
  deleteUser.mockResolvedValue({ error: null });
  rpc.mockImplementation(async (name: string) => {
    if (name === "register_demo_identity") return { data: null, error: null };
    if (name === "is_demo_account") return { data: true, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "token-hash-secret" } },
    error: null,
  });
});

describe("open-demo-account Edge handler", () => {
  it("returns 503 when DEMO_PROVISION_ENABLED is not true", async () => {
    config.DEMO_PROVISION_ENABLED = "false";
    const response = await handler()(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_provision_disabled" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied email or user id", async () => {
    const byEmail = await handler()(post({ email: "attacker@example.com" }));
    expect(byEmail.status).toBe(400);
    expect(await byEmail.json()).toEqual({ error: "identity_not_accepted" });

    const byId = await handler()(post({ userId: "existing" }));
    expect(byId.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("provisions only after registry verification and returns token hash", async () => {
    const response = await handler()(post({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      userId: "demo-uid",
      email: "demo+11111111-1111-4111-8111-111111111111@demo.jakstoimy.local",
      tokenHash: "token-hash-secret",
      verifyType: "email",
    });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: body.email,
        app_metadata: { account_kind: "demo" },
      })
    );
    expect(rpc).toHaveBeenCalledWith("register_demo_identity", {
      p_user_id: "demo-uid",
    });
    expect(rpc).toHaveBeenCalledWith("is_demo_account", { p_user_id: "demo-uid" });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: body.email,
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes orphan Auth user when register_demo_identity fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "register_demo_identity") {
        return { data: null, error: { message: "boom" } };
      }
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "provision_failed" });
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("deletes orphan when is_demo_account verification fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "register_demo_identity") return { data: null, error: null };
      if (name === "is_demo_account") return { data: false, error: null };
      return { data: null, error: null };
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("deletes orphan when generateLink fails", async () => {
    generateLink.mockResolvedValue({
      data: null,
      error: { message: "link failed" },
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith("demo-uid");
  });

  it("never calls generateLink for a non-demo or mismatched createUser email", async () => {
    createUser.mockResolvedValue({
      data: { user: { id: "real-uid", email: "real.user@example.com" } },
      error: null,
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(generateLink).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith("real-uid");
    const body = await response.json();
    expect(body).toEqual({ error: "provision_failed" });
    expect(body).not.toHaveProperty("tokenHash");
    expect(body).not.toHaveProperty("access_token");
  });

  it("does not return a session object — only a one-time token hash for the new demo email", async () => {
    const response = await handler()(post());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.access_token).toBeUndefined();
    expect(body.refresh_token).toBeUndefined();
    expect(body.session).toBeUndefined();
    expect(generateLink.mock.calls).toHaveLength(1);
    expect(generateLink.mock.calls[0]![0]).toEqual({
      type: "magiclink",
      email: "demo+11111111-1111-4111-8111-111111111111@demo.jakstoimy.local",
    });
  });

  it("enforces in-process rate limit before createUser", async () => {
    config.DEMO_PROVISION_RATE_MAX = "2";
    expect((await handler()(post())).status).toBe(200);
    expect((await handler()(post())).status).toBe(200);
    const limited = await handler()(post());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(createUser).toHaveBeenCalledTimes(2);
  });

  it("on createUser failure returns no token and never registers", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "create failed" },
    });
    const response = await handler()(post());
    expect(response.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "provision_failed" });
  });
});
