import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: former member loses group write access", () => {
  let ctx: TestContext;
  let groupId: string;
  let categoryBId: string;
  let groupTxId: string;
  let groupPlanId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} former-member`,
    });
    if (groupError || !group) throw groupError ?? new Error("create_group failed");
    groupId = (group as { id: string }).id;

    const memberInsert = await ctx.admin.from("group_members").upsert({
      group_id: groupId,
      user_id: ctx.userB.userId,
      role: "member",
    });
    if (memberInsert.error) throw memberInsert.error;

    const catB = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userB.userId, name: `${SENTINEL} catB`, type: "expense" })
      .select("id")
      .single();
    if (catB.error) throw catB.error;
    categoryBId = catB.data.id;

    const tx = await ctx.userB.client
      .from("transactions")
      .insert({
        user_id: ctx.userB.userId,
        group_id: groupId,
        category_id: categoryBId,
        description: `${SENTINEL} B group tx`,
        amount: 42,
        type: "expense",
        date: "2026-06-01",
      })
      .select("id")
      .single();
    if (tx.error) throw tx.error;
    groupTxId = tx.data.id;

    const plan = await ctx.userB.client
      .from("plans")
      .insert({
        user_id: ctx.userB.userId,
        group_id: groupId,
        name: `${SENTINEL} B group plan`,
        kind: "debt",
        start_date: "2026-06-01",
        end_date: "2026-12-31",
      })
      .select("id")
      .single();
    if (plan.error) throw plan.error;
    groupPlanId = plan.data.id;

    const leave = await ctx.userB.client.rpc("leave_group", { p_group_id: groupId });
    if (leave.error) throw leave.error;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("former member cannot update their own group transaction", async () => {
    const result = await ctx.userB.client
      .from("transactions")
      .update({ amount: 99 })
      .eq("id", groupTxId)
      .select();
    expectBlockedWrite(result);
  });

  it("former member cannot delete their own group transaction", async () => {
    const result = await ctx.userB.client.from("transactions").delete().eq("id", groupTxId).select();
    expectBlockedWrite(result);
  });

  it("group owner can still update the former member's group transaction", async () => {
    const result = await ctx.userA.client
      .from("transactions")
      .update({ amount: 50 })
      .eq("id", groupTxId)
      .select("amount");
    expect(result.error).toBeNull();
    expect(result.data?.[0]?.amount).toBe(50);
  });

  it("former member cannot update their own group plan", async () => {
    const result = await ctx.userB.client
      .from("plans")
      .update({ name: `${SENTINEL} hacked` })
      .eq("id", groupPlanId)
      .select();
    expectBlockedWrite(result);
  });

  it("former member cannot delete their own group plan", async () => {
    const result = await ctx.userB.client.from("plans").delete().eq("id", groupPlanId).select();
    expectBlockedWrite(result);
  });

  it("former member cannot link transactions via settlement RPC", async () => {
    const link = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: groupPlanId,
      p_transaction_id: groupTxId,
    });
    expect(link.error).not.toBeNull();
  });

  it("remaining member owner can still link via settlement RPC", async () => {
    const link = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: groupPlanId,
      p_transaction_id: groupTxId,
    });
    expect(link.error).toBeNull();
  });
});
