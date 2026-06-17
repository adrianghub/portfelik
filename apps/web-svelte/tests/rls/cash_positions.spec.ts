import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: cash_positions", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    // Remove any leftover rows owned by the test users before seeding.
    await ctx.admin
      .from("cash_positions")
      .delete()
      .in("owner_id", [ctx.userA.userId, ctx.userB.userId]);
    // Seed userA's private position via the admin client (bypasses RLS).
    const { error } = await ctx.admin.from("cash_positions").insert({
      owner_id: ctx.userA.userId,
      opening_amount: 1000,
      as_of_date: "2026-06-01",
    });
    if (error) throw error;
  });

  afterAll(async () => {
    await ctx.admin
      .from("cash_positions")
      .delete()
      .in("owner_id", [ctx.userA.userId, ctx.userB.userId]);
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own private position", async () => {
    const { data, error } = await ctx.userA.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("owner_id", ctx.userA.userId)
      .single();
    expect(error).toBeNull();
    expect(Number(data?.opening_amount)).toBe(1000);
  });

  it("user B cannot read user A private position", async () => {
    const { data, error } = await ctx.userB.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("owner_id", ctx.userA.userId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("user B cannot insert a position owned by user A", async () => {
    const result = await ctx.userB.client
      .from("cash_positions")
      .insert({
        owner_id: ctx.userA.userId,
        opening_amount: 5,
        as_of_date: "2026-06-01",
      })
      .select();
    expectBlockedWrite(result);
  });

  it("user A can upsert own private position (app path: onConflict owner_id)", async () => {
    // Mirrors upsertPrivateCashPosition in services/cash-position.ts. Requires a
    // plain (non-partial) unique index on owner_id to be a valid ON CONFLICT arbiter.
    const { error } = await ctx.userA.client
      .from("cash_positions")
      .upsert(
        { owner_id: ctx.userA.userId, opening_amount: 1234, as_of_date: "2026-06-02" },
        { onConflict: "owner_id" },
      );
    expect(error).toBeNull();

    const { data } = await ctx.userA.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("owner_id", ctx.userA.userId)
      .single();
    expect(Number(data?.opening_amount)).toBe(1234);
  });
});
