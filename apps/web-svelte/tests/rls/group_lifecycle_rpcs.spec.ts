import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: group lifecycle (owner-only admin)", () => {
  let ctx: TestContext;
  let groupId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data, error } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} lifecycle`,
    });
    if (error || !data) throw error ?? new Error("no group");
    groupId = (data as { id: string }).id;

    const memberInsert = await ctx.admin.from("group_members").upsert({
      group_id: groupId,
      user_id: ctx.userB.userId,
      role: "member",
    });
    if (memberInsert.error) throw memberInsert.error;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("owner can remove a member via remove_group_member", async () => {
    const { error } = await ctx.userA.client.rpc("remove_group_member", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(error).toBeNull();

    const { data } = await ctx.admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", ctx.userB.userId);
    expect(data?.length ?? 0).toBe(0);

    await ctx.admin.from("group_members").upsert({
      group_id: groupId,
      user_id: ctx.userB.userId,
      role: "member",
    });
  });

  it("plain member cannot remove another member", async () => {
    const { error } = await ctx.userB.client.rpc("remove_group_member", {
      p_group_id: groupId,
      p_user_id: ctx.userA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("co-owner cannot remove another member", async () => {
    const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(nominate.error).toBeNull();

    const { error } = await ctx.userB.client.rpc("remove_group_member", {
      p_group_id: groupId,
      p_user_id: ctx.userA.userId,
    });
    expect(error).not.toBeNull();

    await ctx.userA.client.rpc("revoke_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
  });

  it("co-owner cannot invite, disband, or nominate", async () => {
    const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(nominate.error).toBeNull();

    const invite = await ctx.userB.client.rpc("invite_user", {
      p_group_id: groupId,
      p_email: `${SENTINEL} outsider@rls.test`,
    });
    expect(invite.error).not.toBeNull();

    const disband = await ctx.userB.client.rpc("disband_group", {
      p_group_id: groupId,
    });
    expect(disband.error).not.toBeNull();

    const nominateOther = await ctx.userB.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userA.userId,
    });
    expect(nominateOther.error).not.toBeNull();

    await ctx.userA.client.rpc("revoke_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
  });
});
