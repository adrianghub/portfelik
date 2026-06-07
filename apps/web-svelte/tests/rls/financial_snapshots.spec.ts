import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: financial_snapshots", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    await ctx.admin
      .from("financial_snapshots")
      .delete()
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);

    const { error: insertA } = await ctx.admin.from("financial_snapshots").insert({
      user_id: ctx.userA.userId,
      as_of_date: "2026-06-01",
      cash_amount: 42000,
      investments_amount: 51000,
      real_estate_amount: 420000,
    });
    if (insertA) throw insertA;

    const { error: insertB } = await ctx.admin.from("financial_snapshots").insert({
      user_id: ctx.userB.userId,
      as_of_date: "2026-06-01",
      cash_amount: 1000,
      investments_amount: 0,
      real_estate_amount: 0,
    });
    if (insertB) throw insertB;
  });

  afterAll(async () => {
    await ctx.admin
      .from("financial_snapshots")
      .delete()
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own snapshot", async () => {
    const { data, error } = await ctx.userA.client
      .from("financial_snapshots")
      .select("cash_amount")
      .single();
    expect(error).toBeNull();
    expect(Number(data?.cash_amount)).toBe(42000);
  });

  it("user A cannot read user B snapshot", async () => {
    const { data, error } = await ctx.userA.client
      .from("financial_snapshots")
      .select("cash_amount")
      .eq("user_id", ctx.userB.userId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("user A cannot update user B snapshot", async () => {
    const result = await ctx.userA.client
      .from("financial_snapshots")
      .update({ cash_amount: 1 })
      .eq("user_id", ctx.userB.userId)
      .select();
    expectBlockedWrite(result);
  });

  it("user A upserts own snapshot", async () => {
    const { data, error } = await ctx.userA.client
      .from("financial_snapshots")
      .upsert({
        user_id: ctx.userA.userId,
        as_of_date: "2026-06-05",
        cash_amount: 43000,
        investments_amount: 51000,
        real_estate_amount: 420000,
      })
      .select("cash_amount")
      .single();
    expect(error).toBeNull();
    expect(Number(data?.cash_amount)).toBe(43000);
  });
});
