import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createInvitationHandler } from "../../../../supabase/functions/send-group-invitation/handler";
import {
  assertLocalSupabaseUrl,
  cleanupSentinels,
  provisionTwoUsers,
  SENTINEL,
  type TestContext,
} from "./setup";

/** Run against local GoTrue with GOTRUE_DISABLE_SIGNUP=true. No remote fixtures. */
describe("invitation password Auth with public signup disabled", () => {
  let ctx: TestContext;
  let groupId: string;
  const createdUsers: string[] = [];
  const localUrl = process.env.SUPABASE_URL!;
  const client = () =>
    createClient(localUrl, process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  beforeAll(async () => {
    assertLocalSupabaseUrl(localUrl);
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL}password-auth`,
    });
    if (group.error) throw group.error;
    groupId = group.data.id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const id of createdUsers) await ctx.admin.auth.admin.deleteUser(id);
    if (ctx) {
      await ctx.admin.auth.admin.updateUserById(ctx.userB.userId, {
        password: process.env.RLS_TEST_PASSWORD!,
      });
      await cleanupSentinels(ctx.admin);
    }
  });

  async function invitation(email: string) {
    const result = await ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: email,
      p_actor_id: ctx.userA.userId,
    });
    if (result.error) throw result.error;
    return result.data as { token: string; invitation: { id: string } };
  }
  async function requestAccess(token: string, email: string) {
    let actionLink = "";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://api.resend.com/")) {
        const message = JSON.parse(String(init?.body));
        actionLink = message.text.match(/https?:\/\/\S+/)?.[0] ?? "";
        return new Response("{}", { status: 200 });
      }
      return realFetch(input, init);
    });
    try {
      const values: Record<string, string> = {
        SUPABASE_URL: localUrl,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        RESEND_API_KEY: "local-email-intercept",
        GROUP_INVITATION_FROM_EMAIL: "local@example.test",
        PUBLIC_APP_ORIGIN: "http://127.0.0.1:5173",
      };
      const handler = createInvitationHandler((key) => values[key], createClient);
      const response = await handler(
        new Request("http://edge.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "access", token, email, setupPassword: true }),
        })
      );
      return { response, actionLink };
    } finally {
      vi.unstubAllGlobals();
    }
  }
  async function verify(link: string, auth = client()) {
    const url = new URL(link);
    const type = url.searchParams.get("type") as "invite" | "magiclink" | "recovery";
    return {
      auth,
      result: await auth.auth.verifyOtp({ token_hash: url.searchParams.get("token")!, type }),
    };
  }
  async function membership(userId: string) {
    const result = await ctx.admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (result.error) throw result.error;
    return result.data;
  }

  it("rejects public signup", async () => {
    const result = await client().auth.signUp({
      email: `blocked-${crypto.randomUUID()}@example.test`,
      password: crypto.randomUUID(),
    });
    expect(result.error).not.toBeNull();
    expect(result.data.user).toBeNull();
  });

  it("provisions via verified email, saves name/password, resumes after interruption and only then claims", async () => {
    const email = `invited-${crypto.randomUUID()}@example.test`;
    const invite = await invitation(email);
    const access = await requestAccess(invite.token, email);
    expect(access.response.status).toBe(200);
    expect(await access.response.json()).toEqual({ sent: true });
    const { auth, result } = await verify(access.actionLink);
    expect(result.error).toBeNull();
    const uid = result.data.user!.id;
    createdUsers.push(uid);
    expect(await membership(uid)).toEqual([]);
    const password = crypto.randomUUID();
    expect((await auth.auth.updateUser({ password })).error).toBeNull();
    expect(
      (await auth.from("profiles").update({ name: "Zaproszona osoba" }).eq("id", uid)).error
    ).toBeNull();
    await auth.auth.signOut();
    const resumed = client();
    expect((await resumed.auth.signInWithPassword({ email, password })).data.user?.id).toBe(uid);
    expect(await membership(uid)).toEqual([]);
    const profile = await resumed.from("profiles").select("name").eq("id", uid).single();
    expect(profile.data?.name).toBe("Zaproszona osoba");
    expect(
      (await resumed.rpc("claim_group_invitation", { p_token: invite.token })).error
    ).toBeNull();
    expect(await membership(uid)).toHaveLength(1);
    expect(
      (await resumed.rpc("claim_group_invitation", { p_token: invite.token })).error
    ).not.toBeNull();
    const replay = await verify(access.actionLink);
    expect(replay.result.error).not.toBeNull();
  });

  it("preserves an existing Google identity and profile while adding email/password", async () => {
    const email = `google-${crypto.randomUUID()}@example.test`;
    const created = await ctx.admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: "google", providers: ["google"] },
    });
    if (created.error) throw created.error;
    const uid = created.data.user.id;
    createdUsers.push(uid);
    // Synthetic, local-only Google identity. This tests GoTrue's existing-user
    // linking behavior; real Google OAuth still needs staging/device validation.
    if (!/^[0-9a-f-]{36}$/.test(uid)) throw new Error("invalid_fixture_uid");
    const dbUrl = process.env.SUPABASE_DB_URL!;
    assertLocalSupabaseUrl(localUrl);
    if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):/.test(dbUrl))
      throw new Error("local_database_required");
    execFileSync(
      "psql",
      [
        dbUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `
      delete from auth.identities where user_id = '${uid}';
      insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
      values ('google-sub-${uid}', '${uid}', jsonb_build_object('sub','google-sub-${uid}','email','${email}','email_verified',true), 'google', now(), now(), now());
    `,
      ],
      { stdio: "pipe" }
    );
    const before = await ctx.admin.auth.admin.getUserById(uid);
    if (before.error) throw before.error;
    expect(before.data.user?.identities?.map((i) => i.provider)).toEqual(["google"]);
    const profileBefore = await ctx.admin.from("profiles").select("*").eq("id", uid).single();
    const invite = await invitation(email);
    const access = await requestAccess(invite.token, email);
    expect(access.response.status).toBe(200);
    const { auth, result } = await verify(access.actionLink);
    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe(uid);
    const password = crypto.randomUUID();
    expect((await auth.auth.updateUser({ password })).error).toBeNull();
    const after = await ctx.admin.auth.admin.getUserById(uid);
    expect(
      after.data.user?.identities?.filter((i) => i.provider === "google").map((i) => i.id)
    ).toEqual(before.data.user?.identities?.map((i) => i.id));
    expect((await ctx.admin.from("profiles").select("*").eq("id", uid).single()).data).toEqual(
      profileBefore.data
    );
    expect((await client().auth.signInWithPassword({ email, password })).data.user?.id).toBe(uid);
    expect(await membership(uid)).toEqual([]);
  });

  it("rejects revoked/expired invitations and the wrong recipient without creating users", async () => {
    const email = `expired-${crypto.randomUUID()}@example.test`;
    const invite = await invitation(email);
    const invalid = await requestAccess(invite.token, "other@example.test");
    expect(invalid.response.status).toBe(403);
    expect(invalid.actionLink).toBe("");
    await ctx.admin
      .from("group_invitations")
      .update({ expires_at: "2020-01-01T00:00:00Z" })
      .eq("id", invite.invitation.id);
    const expired = await requestAccess(invite.token, email);
    expect(expired.response.status).toBe(403);
    expect(expired.actionLink).toBe("");
  });

  it("still rejects membership when the invitation expires after email verification", async () => {
    const email = `late-${crypto.randomUUID()}@example.test`;
    const invite = await invitation(email);
    const access = await requestAccess(invite.token, email);
    const { auth, result } = await verify(access.actionLink);
    expect(result.error).toBeNull();
    const uid = result.data.user!.id;
    createdUsers.push(uid);
    await ctx.admin
      .from("group_invitations")
      .update({ expires_at: "2020-01-01T00:00:00Z" })
      .eq("id", invite.invitation.id);
    expect(
      (await auth.rpc("claim_group_invitation", { p_token: invite.token })).error
    ).not.toBeNull();
    expect(await membership(uid)).toEqual([]);
  });

  it("rejects a revoked invitation before provisioning an Auth account", async () => {
    const email = `revoked-${crypto.randomUUID()}@example.test`;
    const invite = await invitation(email);
    expect(
      (await ctx.userA.client.rpc("cancel_invitation", { p_invitation_id: invite.invitation.id }))
        .error
    ).toBeNull();
    const access = await requestAccess(invite.token, email);
    expect(access.response.status).toBe(403);
    expect(access.actionLink).toBe("");
  });

  it("enforces the access quota under parallel requests", async () => {
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const email = `quota-${crypto.randomUUID()}@example.test`;
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          ctx.admin.rpc("record_group_invitation_access_attempt", {
            p_token: token,
            p_email: email,
          })
        )
      );
      expect(results.every((r) => !r.error)).toBe(true);
      expect(results.filter((r) => r.data === true)).toHaveLength(5);
      expect(results.filter((r) => r.data === false)).toHaveLength(7);
    } finally {
      await ctx.admin.from("group_invitation_access_attempts").delete().eq("email", email);
    }
  });

  it("a verified recovery session can set a password without joining any group", async () => {
    const link = await ctx.admin.auth.admin.generateLink({
      type: "recovery",
      email: ctx.userB.email,
    });
    if (link.error || !link.data.properties?.action_link)
      throw link.error ?? new Error("recovery_link_missing");
    const { auth, result } = await verify(link.data.properties.action_link);
    expect(result.error).toBeNull();
    expect((await auth.auth.updateUser({ password: crypto.randomUUID() })).error).toBeNull();
    expect(await membership(ctx.userB.userId)).toEqual([]);
  });
});
