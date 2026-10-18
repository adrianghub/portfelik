import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, getUser, generateLink } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  generateLink: vi.fn(),
}));
import { createInvitationHandler } from "../../../../supabase/functions/send-group-invitation/handler";

const invitation = { id: "i1", group_name: "Dom", delivery_status: "pending" };
const request = (body: unknown, origin = "https://localhost") =>
  new Request("https://edge.test", {
    method: "POST",
    headers: { origin, authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
let config: Record<string, string>;
let fetchEmail: ReturnType<typeof vi.fn>;
const handler = () =>
  createInvitationHandler(
    (name) => config[name],
    () => ({ rpc, auth: { getUser, admin: { generateLink } } })
  );

beforeEach(() => {
  vi.clearAllMocks();
  config = {
    SUPABASE_URL: "https://db.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-test",
    RESEND_API_KEY: "resend-test",
    GROUP_INVITATION_FROM_EMAIL: "invites@jakstoimy.pl",
    GROUP_INVITATION_RECIPIENT_ALLOWLIST: "old-tester@example.com",
    APP_ORIGINS: "https://other.test",
  };
  getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  rpc.mockImplementation(async (name) =>
    name === "create_group_invitation_for_delivery"
      ? { data: { invitation, token: "new-token" }, error: null }
      : { data: true, error: null }
  );
  fetchEmail = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchEmail);
});
afterEach(() => vi.unstubAllGlobals());

describe("group invitation Edge handler", () => {
  it.each(["https://localhost", "capacitor://localhost", "https://app.jakstoimy.pl"])(
    "allows CORS from %s with custom origins",
    async (origin) => {
      const response = await handler()(
        new Request("https://edge.test", { method: "OPTIONS", headers: { origin } })
      );
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    }
  );

  it("sends to any owner-authorized recipient despite the retired tester allowlist", async () => {
    const response = await handler()(request({ groupId: "g1", email: " NEW@Example.com " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ invitation: { delivery_status: "sent" } });
    expect(rpc).toHaveBeenCalledWith("create_group_invitation_for_delivery", {
      p_group_id: "g1",
      p_email: "new@example.com",
      p_actor_id: "owner",
      p_invitation_id: null,
    });
    const email = JSON.parse(fetchEmail.mock.calls[0][1].body);
    expect(email.to).toEqual(["new@example.com"]);
    expect(email.text).toContain("https://app.jakstoimy.pl/invite/new-token");
  });

  it("does not send when the owner RPC denies the request", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "not_group_owner" } });
    const response = await handler()(request({ groupId: "g1", email: "a@example.com" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "not_group_owner" });
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it.each(["rejected", "network", "unconfigured"])(
    "retains a retryable invitation after %s delivery",
    async (mode) => {
      if (mode === "unconfigured") delete config.RESEND_API_KEY;
      else if (mode === "network") fetchEmail.mockRejectedValueOnce(new Error("offline"));
      else fetchEmail.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
      const response = await handler()(request({ groupId: "g1", email: "a@example.com" }));
      expect(await response.json()).toMatchObject({
        invitation: { id: "i1", delivery_status: "failed" },
        deliveryError: "email_send_failed",
      });
      expect(rpc).toHaveBeenCalledWith("record_group_invitation_delivery", {
        p_invitation_id: "i1",
        p_outcome: "failed",
      });
    }
  );

  it("resends the selected invitation instead of creating a duplicate", async () => {
    await handler()(request({ groupId: "g1", email: "a@example.com", invitationId: "i1" }));
    expect(rpc).toHaveBeenCalledWith(
      "create_group_invitation_for_delivery",
      expect.objectContaining({ p_invitation_id: "i1" })
    );
  });

  it.each([null, {}, { email: 123 }, { email: "a@b.com", invitationId: 123 }])(
    "rejects invalid bodies safely: %j",
    async (body) => {
      const response = await handler()(request(body));
      expect(response.status).toBe(400);
      expect(fetchEmail).not.toHaveBeenCalled();
    }
  );

  it("keeps anonymous access verification uniform", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const response = await handler()(
      request({ action: "access", email: "a@example.com", token: "wrong-token" })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invitation_access_denied" });
    expect(generateLink).not.toHaveBeenCalled();
  });
});

describe("invited password setup", () => {
  it("only generates a setup link after rate and recipient validation", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { action_link: "https://auth.test/verified-link" } },
      error: null,
    });
    const response = await handler()(
      request({
        action: "access",
        email: " NEW@example.com ",
        token: "a".repeat(64),
        setupPassword: true,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_group_invitation_access_attempt",
      "verify_group_invitation_recipient",
    ]);
    const options = generateLink.mock.calls[0][0];
    const callback = new URL(options.options.redirectTo);
    const setup = new URL(callback.searchParams.get("redirectTo")!, "https://app.jakstoimy.pl");
    expect(setup.pathname).toBe("/auth/setup");
    expect(setup.searchParams.get("redirectTo")).toBe(`/invite/${"a".repeat(64)}`);
    expect(options).not.toHaveProperty("password");
    expect(rpc).not.toHaveBeenCalledWith("claim_group_invitation", expect.anything());
  });

  it("uses a magic link for an existing account without changing its credentials", async () => {
    generateLink
      .mockResolvedValueOnce({ data: null, error: { message: "already registered" } })
      .mockResolvedValueOnce({
        data: { properties: { action_link: "https://auth.test/existing" } },
        error: null,
      });
    const response = await handler()(
      request({
        action: "access",
        email: "a@example.com",
        token: "a".repeat(64),
        setupPassword: true,
      })
    );
    expect(await response.json()).toEqual({ sent: true });
    expect(generateLink.mock.calls.map(([input]) => input.type)).toEqual(["invite", "magiclink"]);
  });

  it("does not generate or send a link after rate denial", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await handler()(
      request({
        action: "access",
        email: "a@example.com",
        token: "a".repeat(64),
        setupPassword: true,
      })
    );
    expect(response.status).toBe(403);
    expect(generateLink).not.toHaveBeenCalled();
    expect(fetchEmail).not.toHaveBeenCalled();
  });
});
