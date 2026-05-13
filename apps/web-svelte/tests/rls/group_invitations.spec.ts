import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: group_invitations (direct writes blocked, visible to invitee/creator/owner)", () => {
  let ctx: TestContext;
  let groupId: string;
  let inviteId: string;

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
});
