import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: plan_debt_terms", () => {
  let ctx: TestContext;
  let planAId: string;
  let planBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seedPlan = async (userId: string, label: string) => {
      const { data: plan, error } = await ctx.admin
        .from("plans")
        .insert({
          user_id: userId,
          name: `${SENTINEL} ${label}`,
          kind: "debt",
          start_date: "2026-01-01",
          end_date: "2036-01-01",
          target_amount: 330000,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: termsError } = await ctx.admin.from("plan_debt_terms").insert({
        plan_id: plan.id,
        original_amount: 330000,
        current_balance: 206000,
        annual_rate: 7.18,
        monthly_payment: 2370,
      });
      if (termsError) throw termsError;
      return plan.id as string;
    };

    planAId = await seedPlan(ctx.userA.userId, "debtA");
    planBId = await seedPlan(ctx.userB.userId, "debtB");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own debt terms", async () => {
    const { data, error } = await ctx.userA.client
      .from("plan_debt_terms")
      .select("current_balance")
      .eq("plan_id", planAId)
      .single();
    expect(error).toBeNull();
    expect(Number(data?.current_balance)).toBe(206000);
  });

  it("user A cannot read user B debt terms", async () => {
    const { data, error } = await ctx.userA.client
      .from("plan_debt_terms")
      .select("current_balance")
      .eq("plan_id", planBId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("user A cannot update user B debt terms", async () => {
    const result = await ctx.userA.client
      .from("plan_debt_terms")
      .update({ current_balance: 1 })
      .eq("plan_id", planBId)
      .select();
    expectBlockedWrite(result);
  });
});
