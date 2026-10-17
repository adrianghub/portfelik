import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("group invitation lifecycle", () => {
  let ctx: TestContext;
  let groupId: string;
  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });
  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} invitation-lifecycle`,
    });
    if (group.error) throw group.error;
    groupId = (group.data as { id: string }).id;
  });
  afterAll(async () => {
    if (ctx) await cleanupSentinels(ctx.admin);
  });

  async function mint(email = ctx.userB.email, invitationId?: string) {
    return ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: email,
      p_actor_id: ctx.userA.userId,
      ...(invitationId ? { p_invitation_id: invitationId } : {}),
    });
  }
  async function create() {
    const result = await mint();
    if (result.error) throw result.error;
    return result.data as { invitation: { id: string }; token: string };
  }
  async function expire(id: string) {
    const result = await ctx.admin
      .from("group_invitations")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", id);
    expect(result.error).toBeNull();
  }
  async function countRows(table: string, column: string, value: string) {
    const result = await ctx.admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, value);
    expect(result.error).toBeNull();
    return result.count;
  }

  it("denies anonymous mutation, wrong-recipient rejection and unrelated cancellation/deletion", async () => {
    const { invitation } = await create();
    for (const name of [
      "reject_invitation",
      "cancel_invitation",
      "delete_group_invitation",
    ] as const) {
      const response = await createAnonClient().rpc(name, { p_invitation_id: invitation.id });
      expect(response.error).not.toBeNull();
    }
    expect(
      (await ctx.userA.client.rpc("reject_invitation", { p_invitation_id: invitation.id })).error
        ?.message
    ).toContain("email_mismatch");
    expect(
      (await ctx.userB.client.rpc("cancel_invitation", { p_invitation_id: invitation.id })).error
        ?.message
    ).toContain("not_authorized");
    await expire(invitation.id);
    expect(
      (await ctx.userB.client.rpc("delete_group_invitation", { p_invitation_id: invitation.id }))
        .error?.message
    ).toContain("not_authorized");
  });

  it("requires cancellation before deleting a live invitation and invalidates its link", async () => {
    const { invitation, token } = await create();
    expect(
      (await ctx.userA.client.rpc("delete_group_invitation", { p_invitation_id: invitation.id }))
        .error?.message
    ).toContain("invitation_still_pending");
    expect(
      (await ctx.userA.client.rpc("cancel_invitation", { p_invitation_id: invitation.id })).error
    ).toBeNull();
    expect(
      (await createAnonClient().rpc("get_group_invitation_preview", { p_token: token })).data
    ).toBeNull();
    expect(
      (await ctx.userB.client.rpc("accept_invitation", { p_invitation_id: invitation.id })).error
    ).not.toBeNull();
    expect(
      (await ctx.userA.client.rpc("delete_group_invitation", { p_invitation_id: invitation.id }))
        .error
    ).toBeNull();
    expect(await countRows("group_invitations", "id", invitation.id)).toBe(0);
  });

  it("rejects safely and removes invitation notifications", async () => {
    const { invitation } = await create();
    const before = await ctx.admin
      .from("notifications")
      .select("id")
      .eq("type", "group_invitation")
      .contains("data", { invitationId: invitation.id });
    expect(before.error).toBeNull();
    expect(before.data?.length).toBeGreaterThan(0);
    expect(
      (await ctx.userB.client.rpc("reject_invitation", { p_invitation_id: invitation.id })).error
    ).toBeNull();
    const after = await ctx.admin
      .from("notifications")
      .select("id")
      .contains("data", { invitationId: invitation.id });
    expect(after.error).toBeNull();
    expect(after.data).toEqual([]);
    expect(
      (await ctx.userA.client.rpc("delete_group_invitation", { p_invitation_id: invitation.id }))
        .error
    ).toBeNull();
  });

  it("deletes accepted history without removing a member", async () => {
    const { invitation, token } = await create();
    expect(
      (await ctx.userB.client.rpc("claim_group_invitation", { p_token: token })).error
    ).toBeNull();
    expect(
      (await ctx.userA.client.rpc("delete_group_invitation", { p_invitation_id: invitation.id }))
        .error
    ).toBeNull();
    const members = await ctx.admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", ctx.userB.userId);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(1);
  });

  it("allows new invitations after expiry and blocks revival of an older duplicate", async () => {
    const old = await create();
    await expire(old.invitation.id);
    const current = await create();
    expect(current.invitation.id).not.toBe(old.invitation.id);
    expect((await mint()).error?.message).toContain("invitation_already_pending");
    expect((await mint(ctx.userB.email, old.invitation.id)).error?.message).toContain(
      "invitation_already_pending"
    );
    expect(
      (
        await ctx.userA.client.rpc("delete_group_invitation", {
          p_invitation_id: old.invitation.id,
        })
      ).error
    ).toBeNull();
    expect(await countRows("group_invitation_tokens", "invitation_id", old.invitation.id)).toBe(0);
  });

  it("does not revive an old invitation after the recipient has joined", async () => {
    const old = await create();
    await expire(old.invitation.id);
    const current = await create();
    expect(
      (await ctx.userB.client.rpc("claim_group_invitation", { p_token: current.token })).error
    ).toBeNull();
    expect((await mint(ctx.userB.email, old.invitation.id)).error?.message).toContain(
      "already_a_member"
    );
  });

  it("keeps quota after history deletion and protects its records from clients", async () => {
    const { invitation } = await create();
    await expire(invitation.id);
    expect(
      (await ctx.userA.client.rpc("delete_group_invitation", { p_invitation_id: invitation.id }))
        .error
    ).toBeNull();
    expect(await countRows("group_invitation_send_attempts", "actor_id", ctx.userA.userId)).toBe(1);
    expect(
      (await ctx.userA.client.from("group_invitation_send_attempts").select("*")).error
    ).not.toBeNull();
    // Fill the remaining durable hourly budget without sending any real email.
    const fill = await ctx.admin
      .from("group_invitation_send_attempts")
      .insert(Array.from({ length: 9 }, () => ({ actor_id: ctx.userA.userId })));
    expect(fill.error).toBeNull();
    expect((await mint()).error?.message).toContain("invitation_rate_limited");
  });

  it("blocks direct history deletion", async () => {
    const { invitation } = await create();
    await expire(invitation.id);
    await ctx.userA.client.from("group_invitations").delete().eq("id", invitation.id);
    expect(await countRows("group_invitations", "id", invitation.id)).toBe(1);
  });

  it("lets the current owner resend and delete invitations created by the former owner", async () => {
    const email = "transfer-recipient@rls.test";
    const stored = await ctx.admin
      .from("group_invitations")
      .insert({
        group_id: groupId,
        group_name: `${SENTINEL} transferred`,
        invited_user_email: email,
        created_by: ctx.userA.userId,
        status: "pending",
        updated_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .select("id")
      .single();
    expect(stored.error).toBeNull();
    const invitationId = stored.data!.id;
    expect(
      (
        await ctx.admin
          .from("group_members")
          .insert({ group_id: groupId, user_id: ctx.userB.userId })
      ).error
    ).toBeNull();
    expect(
      (
        await ctx.userA.client.rpc("transfer_group_ownership", {
          p_group_id: groupId,
          p_new_owner_id: ctx.userB.userId,
        })
      ).error
    ).toBeNull();
    const retry = await ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: email,
      p_actor_id: ctx.userB.userId,
      p_invitation_id: invitationId,
    });
    expect(retry.error).toBeNull();
    expect(
      (await ctx.userB.client.rpc("cancel_invitation", { p_invitation_id: invitationId })).error
    ).toBeNull();
    expect(
      (await ctx.userB.client.rpc("delete_group_invitation", { p_invitation_id: invitationId }))
        .error
    ).toBeNull();
  });

  it("keeps cancellation and acceptance atomic under concurrent requests", async () => {
    const { invitation, token } = await create();
    const results = await Promise.all([
      ctx.userA.client.rpc("cancel_invitation", { p_invitation_id: invitation.id }),
      ctx.userB.client.rpc("claim_group_invitation", { p_token: token }),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const stored = await ctx.admin
      .from("group_invitations")
      .select("status")
      .eq("id", invitation.id)
      .single();
    expect(stored.error).toBeNull();
    const members = await ctx.admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", ctx.userB.userId);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(stored.data!.status === "accepted" ? 1 : 0);
  });

  it("serializes duplicate sends", async () => {
    const results = await Promise.all([mint(), mint()]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.message).toContain(
      "invitation_already_pending"
    );
  });
});
