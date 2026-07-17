import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  createTestInvitation,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: group_invitations (direct writes blocked, visible to invitee/creator/owner)", () => {
  let ctx: TestContext;
  let groupId: string;
  let inviteId: string;
  let signupInviteeUserId: string | null = null;
  const emailReuseInviteeUserIds: string[] = [];

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data: groupData, error: groupErr } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} gi-test`,
    });
    if (groupErr || !groupData) throw groupErr ?? new Error("no group");
    groupId = (groupData as { id: string }).id;

    // Invite via service-role delivery RPC (authenticated invite_user is revoked).
    const invitation = await createTestInvitation(
      ctx.admin,
      groupId,
      ctx.userB.email,
      ctx.userA.userId
    );
    inviteId = invitation.id;
  });

  afterAll(async () => {
    if (!ctx) return;
    for (const userId of emailReuseInviteeUserIds) {
      await ctx.admin.auth.admin.deleteUser(userId);
    }
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

  it("keeps token hashes outside authenticated Data API access", async () => {
    const { data, error } = await ctx.userA.client
      .from("group_invitation_tokens" as "group_invitations")
      .select("*");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("keeps token minting behind the service-role delivery boundary", async () => {
    const result = await ctx.userA.client.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: `direct-${crypto.randomUUID()}@rls.test`,
      p_actor_id: ctx.userA.userId,
    });
    expect(result.error).not.toBeNull();
  });

  it("previews anonymously and claims once for the exact authenticated email", async () => {
    const { data: secondGroup, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} token-claim`,
    });
    if (groupError || !secondGroup) throw groupError ?? new Error("no group");
    const secondGroupId = (secondGroup as { id: string }).id;

    const { data, error } = await ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: secondGroupId,
      p_email: ctx.userB.email,
      p_actor_id: ctx.userA.userId,
    });
    if (error || !data) throw error ?? new Error("no invitation token");
    const token = (data as { token: string }).token;

    const preview = await createAnonClient().rpc("get_group_invitation_preview", {
      p_token: token,
    });
    expect(preview.error).toBeNull();
    expect(preview.data).toMatchObject({ groupName: `${SENTINEL} token-claim` });
    expect(JSON.stringify(preview.data)).not.toContain(ctx.userB.email);

    const verified = await ctx.admin.rpc("verify_group_invitation_recipient", {
      p_token: token,
      p_email: ctx.userB.email,
    });
    expect(verified.error).toBeNull();
    expect(verified.data).toBe(true);
    const browserVerify = await ctx.userA.client.rpc("verify_group_invitation_recipient", {
      p_token: token,
      p_email: ctx.userB.email,
    });
    expect(browserVerify.error).not.toBeNull();

    const wrongClaim = await ctx.userA.client.rpc("claim_group_invitation", { p_token: token });
    expect(wrongClaim.error?.message).toContain("invitation_email_mismatch");

    const claim = await ctx.userB.client.rpc("claim_group_invitation", { p_token: token });
    expect(claim.error).toBeNull();
    expect(claim.data).toMatchObject({ groupId: secondGroupId });

    const membership = await ctx.admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", secondGroupId)
      .eq("user_id", ctx.userB.userId)
      .single();
    expect(membership.error).toBeNull();

    const replay = await ctx.userB.client.rpc("claim_group_invitation", { p_token: token });
    expect(replay.error?.message).toContain("invitation_invalid_or_expired");
  });

  it("hides expired tokens from preview and claim", async () => {
    const invitedEmail = `expired-${crypto.randomUUID()}@rls.test`;
    const { data, error } = await ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: invitedEmail,
      p_actor_id: ctx.userA.userId,
    });
    if (error || !data) throw error ?? new Error("no invitation token");
    const result = data as { token: string; invitation: { id: string } };
    await ctx.admin
      .from("group_invitations")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", result.invitation.id);

    const preview = await createAnonClient().rpc("get_group_invitation_preview", {
      p_token: result.token,
    });
    expect(preview.error).toBeNull();
    expect(preview.data).toBeNull();
  });

  it("denies authenticated clients the legacy invite_user RPC", async () => {
    const { error } = await ctx.userA.client.rpc("invite_user", {
      p_group_id: groupId,
      p_email: `legacy-denied-${crypto.randomUUID()}@rls.test`,
    });
    expect(error).not.toBeNull();
  });

  it("creates a notification when a pending invitee signs up after the invite", async () => {
    const invitedEmail = `pending-invite-${crypto.randomUUID()}@rls.test`;
    const futureInvite = await createTestInvitation(
      ctx.admin,
      groupId,
      invitedEmail,
      ctx.userA.userId
    );
    const futureInviteId = futureInvite.id;

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

  it("dedupes pending invite notifications per recipient, not only per invitation", async () => {
    const invitedEmail = `pending-reused-${crypto.randomUUID()}@rls.test`;
    const movedEmail = `pending-reused-moved-${crypto.randomUUID()}@rls.test`;
    const testPassword = process.env.RLS_TEST_PASSWORD ?? "local-password";

    const futureInvite = await createTestInvitation(
      ctx.admin,
      groupId,
      invitedEmail,
      ctx.userA.userId
    );
    const futureInviteId = futureInvite.id;

    const { data: firstUser, error: firstUserErr } = await ctx.admin.auth.admin.createUser({
      email: invitedEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (firstUserErr || !firstUser.user) throw firstUserErr ?? new Error("no first invitee");
    emailReuseInviteeUserIds.push(firstUser.user.id);

    await ctx.admin.auth.admin.updateUserById(firstUser.user.id, {
      email: movedEmail,
      email_confirm: true,
    });

    const { data: secondUser, error: secondUserErr } = await ctx.admin.auth.admin.createUser({
      email: invitedEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (secondUserErr || !secondUser.user) throw secondUserErr ?? new Error("no second invitee");
    emailReuseInviteeUserIds.push(secondUser.user.id);

    const { data: notifications, error: notificationsErr } = await ctx.admin
      .from("notifications")
      .select("id, user_id, type, data")
      .in("user_id", [firstUser.user.id, secondUser.user.id])
      .eq("type", "group_invitation")
      .contains("data", { invitationId: futureInviteId });

    expect(notificationsErr).toBeNull();
    expect(notifications?.map((n) => n.user_id).sort()).toEqual(
      [firstUser.user.id, secondUser.user.id].sort()
    );
  });
});
