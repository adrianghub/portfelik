import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: group co-owner roles", () => {
  let ctx: TestContext;
  let groupId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data, error } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} co-owner-rpc`,
    });
    if (error || !data) throw error ?? new Error("no group");
    groupId = (data as { id: string }).id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("denies anon is_group_co_owner", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("is_group_co_owner", { p_group_id: groupId });
    expect(error).not.toBeNull();
  });

  it("denies anon nominate_group_co_owner", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(error).not.toBeNull();
  });

  it("denies anon revoke_group_co_owner", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("revoke_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(error).not.toBeNull();
  });

  it("owner cannot be nominated as co-owner", async () => {
    const { error } = await ctx.userA.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userA.userId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("cannot_change_owner_role");
  });

  it("owner can nominate and revoke a non-owner member", async () => {
    await ctx.admin.from("group_members").upsert({
      group_id: groupId,
      user_id: ctx.userB.userId,
      role: "member",
    });

    const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(nominate.error).toBeNull();

    const { data: nominated } = await ctx.admin
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", ctx.userB.userId)
      .single();
    expect(nominated?.role).toBe("co_owner");

    const revoke = await ctx.userA.client.rpc("revoke_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(revoke.error).toBeNull();

    const { data: revoked } = await ctx.admin
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", ctx.userB.userId)
      .single();
    expect(revoked?.role).toBe("member");
  });
});
