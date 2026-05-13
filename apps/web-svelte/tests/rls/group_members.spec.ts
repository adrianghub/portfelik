import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: group_members (direct writes blocked, RPC-only)", () => {
  let ctx: TestContext;
  let groupId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data, error } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} gm-test`,
    });
    if (error || !data) throw error ?? new Error("no group");
    groupId = (data as { id: string }).id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("direct INSERT into group_members is blocked (using false)", async () => {
    const result = await ctx.userA.client.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    expect(result.error).not.toBeNull();
  });

  it("direct DELETE from group_members is blocked", async () => {
    const result = await ctx.userA.client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .select();
    // either explicit error or 0 rows affected (RLS hides the member row)
    if (result.error) return;
    expect(result.data?.length ?? 0).toBe(0);
  });

  it("user A (owner+auto-member) sees own roster row", async () => {
    const { data, error } = await ctx.userA.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    expect(error).toBeNull();
    expect(data?.find((r) => r.user_id === ctx.userA.userId)).toBeTruthy();
  });

  it("user B (non-member) sees no rows in this group", async () => {
    const { data, error } = await ctx.userB.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });
});
