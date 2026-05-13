import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  expectEmpty,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: transactions", () => {
  let ctx: TestContext;
  let categoryAId: string;
  let categoryBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    // Seed categories owned by each user (transactions FK requires it).
    const catA = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} catA`, type: "expense" })
      .select("id")
      .single();
    if (catA.error) throw catA.error;
    categoryAId = catA.data.id;

    const catB = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userB.userId, name: `${SENTINEL} catB`, type: "expense" })
      .select("id")
      .single();
    if (catB.error) throw catB.error;
    categoryBId = catB.data.id;

    // Seed one tx per user.
    const txA = await ctx.admin.from("transactions").insert({
      user_id: ctx.userA.userId,
      category_id: categoryAId,
      description: `${SENTINEL} A tx`,
      amount: 10,
      type: "expense",
      date: "2026-05-01",
    });
    if (txA.error) throw txA.error;

    await ctx.admin.from("transactions").insert({
      user_id: ctx.userB.userId,
      category_id: categoryBId,
      description: `${SENTINEL} B tx`,
      amount: 20,
      type: "expense",
      date: "2026-05-01",
    });
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own tx", async () => {
    const { data, error } = await ctx.userA.client
      .from("transactions")
      .select("id, description")
      .like("description", `${SENTINEL}%`);
    expect(error).toBeNull();
    expect(data?.map((t) => t.description)).toEqual([`${SENTINEL} A tx`]);
  });

  it("user A does NOT see user B's tx", async () => {
    const { data, error } = await ctx.userA.client
      .from("transactions")
      .select("id")
      .eq("description", `${SENTINEL} B tx`);
    expectEmpty({ data, error });
  });

  it("user A cannot insert tx with user_id = B", async () => {
    const result = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userB.userId,
      category_id: categoryBId,
      description: `${SENTINEL} spoofed`,
      amount: 1,
      type: "expense",
      date: "2026-05-01",
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot update user B's tx", async () => {
    const result = await ctx.userA.client
      .from("transactions")
      .update({ amount: 999 })
      .eq("description", `${SENTINEL} B tx`)
      .select();
    expectBlockedWrite(result);
  });

  it("user A cannot delete user B's tx", async () => {
    const result = await ctx.userA.client
      .from("transactions")
      .delete()
      .eq("description", `${SENTINEL} B tx`)
      .select();
    expectBlockedWrite(result);
  });

  describe("group-shared visibility", () => {
    let groupId: string;

    beforeAll(async () => {
      // User A creates group via RPC, then admin client adds B as member.
      const { data: groupData, error: groupErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} group`,
      });
      if (groupErr || !groupData) throw groupErr ?? new Error("no group");
      groupId = (groupData as { id: string }).id;

      const memberInsert = await ctx.admin
        .from("group_members")
        .insert({ group_id: groupId, user_id: ctx.userB.userId });
      if (memberInsert.error) throw memberInsert.error;
    });

    it("user A sees user B's tx via group share", async () => {
      const { data, error } = await ctx.userA.client
        .from("transactions")
        .select("id, description")
        .like("description", `${SENTINEL}%`);
      expect(error).toBeNull();
      const descs = data?.map((t) => t.description).sort();
      expect(descs).toContain(`${SENTINEL} A tx`);
      expect(descs).toContain(`${SENTINEL} B tx`);
    });

    it("user A still cannot UPDATE user B's tx through group", async () => {
      const result = await ctx.userA.client
        .from("transactions")
        .update({ amount: 555 })
        .eq("description", `${SENTINEL} B tx`)
        .select();
      expectBlockedWrite(result);
    });
  });
});
