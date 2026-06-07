import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RPC: transfer_group_ownership syncs group_members.role", () => {
  let ctx: TestContext;
  let groupId: string;
  let inviteId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data: group, error: groupErr } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} transfer-roles`,
    });
    if (groupErr || !group) throw groupErr ?? new Error("no group");
    groupId = (group as { id: string }).id;

    const { data: invite, error: inviteErr } = await ctx.userA.client.rpc("invite_user", {
      p_group_id: groupId,
      p_email: ctx.userB.email,
    });
    if (inviteErr || !invite) throw inviteErr ?? new Error("no invitation");
    inviteId = (invite as { id: string }).id;

    const { error: acceptErr } = await ctx.userB.client.rpc("accept_invitation", {
      p_invitation_id: inviteId,
    });
    if (acceptErr) throw acceptErr;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("promotes the new owner and demotes the outgoing owner on group_members", async () => {
    const { error: transferErr } = await ctx.userA.client.rpc("transfer_group_ownership", {
      p_group_id: groupId,
      p_new_owner_id: ctx.userB.userId,
    });
    expect(transferErr).toBeNull();

    const { data: members, error: membersErr } = await ctx.admin
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", groupId)
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);
    expect(membersErr).toBeNull();

    const roleA = members?.find((m) => m.user_id === ctx.userA.userId)?.role;
    const roleB = members?.find((m) => m.user_id === ctx.userB.userId)?.role;
    expect(roleA).toBe("member");
    expect(roleB).toBe("owner");

    const { data: isCoOwner, error: coOwnerErr } = await ctx.userB.client.rpc(
      "is_group_co_owner",
      { p_group_id: groupId }
    );
    expect(coOwnerErr).toBeNull();
    expect(isCoOwner).toBe(true);

    const { data: formerOwnerCoOwner, error: formerErr } = await ctx.userA.client.rpc(
      "is_group_co_owner",
      { p_group_id: groupId }
    );
    expect(formerErr).toBeNull();
    expect(formerOwnerCoOwner).toBe(false);
  });
});
