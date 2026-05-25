import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: group_invitations (direct writes blocked, visible to invitee/creator/owner)", () => {
  let ctx: TestContext;
  let groupId: string;
  let inviteId: string;
  let signupInviteeUserId: string | null = null;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data: groupData, error: groupErr } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} gi-test`,
    });
    if (groupErr || !groupData) throw groupErr ?? new Error("no group");
    groupId = (groupData as { id: string }).id;

    // Invite via RPC so we have a row to test reads against.
    const { data: invData, error: invErr } = await ctx.userA.client.rpc("invite_user", {
      p_group_id: groupId,
      p_email: ctx.userB.email,
    });
    if (invErr || !invData) throw invErr ?? new Error("no invitation");
    inviteId = (invData as { id: string }).id;
  });

  afterAll(async () => {
    if (signupInviteeUserId) {
      await ctx.admin.auth.admin.deleteUser(signupInviteeUserId);
    }
    await cleanupSentinels(ctx.admin);
  });

  it("direct INSERT into group_invitations is blocked", async () => {
    const result = await ctx.userA.client.from("group_invitations").insert({
      group_id: groupId,
      group_name: `${SENTINEL} gi-test`,
      created_by: ctx.userA.userId,
      invited_user_email: "evil@rls.test",
      status: "pending",
    });
    expect(result.error).not.toBeNull();
  });

  it("creator (user A) sees the invitation", async () => {
    const { data, error } = await ctx.userA.client
      .from("group_invitations")
      .select("id")
      .eq("id", inviteId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("invitee (user B) sees the invitation by email match", async () => {
    const { data, error } = await ctx.userB.client
      .from("group_invitations")
      .select("id")
      .eq("id", inviteId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("creates a notification when a pending invitee signs up after the invite", async () => {
    const invitedEmail = `pending-invite-${crypto.randomUUID()}@rls.test`;
    const { data: futureInvite, error: futureInviteErr } = await ctx.userA.client.rpc(
      "invite_user",
      {
        p_group_id: groupId,
        p_email: invitedEmail,
      }
    );
    if (futureInviteErr || !futureInvite) throw futureInviteErr ?? new Error("no future invite");
    const futureInviteId = (futureInvite as { id: string }).id;

    const { data: before } = await ctx.admin
      .from("notifications")
      .select("id")
      .eq("type", "group_invitation")
      .contains("data", { invitationId: futureInviteId });
    expect(before?.length ?? 0).toBe(0);

    const { data: createdUser, error: createUserErr } = await ctx.admin.auth.admin.createUser({
      email: invitedEmail,
      password: process.env.RLS_TEST_PASSWORD ?? "local-password",
      email_confirm: true,
    });
    if (createUserErr || !createdUser.user) {
      throw createUserErr ?? new Error("createUser returned no user");
    }
    signupInviteeUserId = createdUser.user.id;

    const { data: notifications, error: notificationsErr } = await ctx.admin
      .from("notifications")
      .select("id, user_id, type, data")
      .eq("user_id", signupInviteeUserId)
      .eq("type", "group_invitation")
      .contains("data", { invitationId: futureInviteId });

    expect(notificationsErr).toBeNull();
    expect(notifications?.length).toBe(1);
    expect(notifications?.[0]?.data).toMatchObject({
      invitationId: futureInviteId,
      groupId,
    });
  });
});
