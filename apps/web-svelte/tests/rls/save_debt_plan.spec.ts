import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: save_debt_plan", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("creates plan and terms atomically", async () => {
    const { data, error } = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} car loan`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-01-01",
      p_end_date: "2028-01-01",
      p_target_amount: 40000,
      p_original_amount: 40000,
      p_current_balance: 38000,
      p_annual_rate: 7.5,
      p_monthly_payment: 900,
      p_first_payment_date: "2026-01-01",
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(error).toBeNull();
    const planId = data?.plan?.id as string;
    expect(planId).toBeTruthy();

    const terms = await ctx.admin
      .from("plan_debt_terms")
      .select("original_amount, current_balance, anchor_balance")
      .eq("plan_id", planId)
      .single();
    expect(terms.error).toBeNull();
    expect(Number(terms.data?.original_amount)).toBe(40000);
    expect(terms.data?.anchor_balance).not.toBeNull();
  });

  it("updates plan dates and terms together", async () => {
    const created = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} update loan`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-02-01",
      p_end_date: "2027-02-01",
      p_target_amount: 10000,
      p_original_amount: 10000,
      p_current_balance: 9000,
      p_annual_rate: 5,
      p_monthly_payment: 500,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(created.error).toBeNull();
    const planId = created.data?.plan?.id as string;

    const updated = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: planId,
      p_name: `${SENTINEL} updated loan`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-02-01",
      p_end_date: "2028-02-01",
      p_target_amount: 10000,
      p_original_amount: 10000,
      p_current_balance: 8500,
      p_annual_rate: 5.5,
      p_monthly_payment: 520,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: true,
      p_clear_balance_anchor: false,
    });
    expect(updated.error).toBeNull();

    const plan = await ctx.admin.from("plans").select("name, end_date").eq("id", planId).single();
    expect(plan.data?.name).toContain("updated loan");
    expect(plan.data?.end_date).toBe("2028-02-01");

    const terms = await ctx.admin
      .from("plan_debt_terms")
      .select("current_balance, monthly_payment, anchor_balance")
      .eq("plan_id", planId)
      .single();
    expect(Number(terms.data?.current_balance)).toBe(8500);
    expect(Number(terms.data?.monthly_payment)).toBe(520);
    expect(Number(terms.data?.anchor_balance)).toBe(8500);
  });

  it("rolls back on invalid balance without creating a plan", async () => {
    const { error } = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} bad balance`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-03-01",
      p_end_date: "2027-03-01",
      p_target_amount: 5000,
      p_original_amount: 5000,
      p_current_balance: 6000,
      p_annual_rate: 4,
      p_monthly_payment: 200,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/debt_balance_exceeds_original/);

    const plans = await ctx.admin
      .from("plans")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .ilike("name", `%${SENTINEL}%bad balance%`);
    expect(plans.data?.length ?? 0).toBe(0);
  });

  it("rejects edit on refinanced plan", async () => {
    const created = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} refinanced`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-04-01",
      p_end_date: "2027-04-01",
      p_target_amount: 8000,
      p_original_amount: 8000,
      p_current_balance: 8000,
      p_annual_rate: 3,
      p_monthly_payment: 300,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    const planId = created.data?.plan?.id as string;
    await ctx.admin.from("plans").update({ status: "refinanced" }).eq("id", planId);

    const { error } = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: planId,
      p_name: `${SENTINEL} refinanced`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-04-01",
      p_end_date: "2027-04-01",
      p_target_amount: 8000,
      p_original_amount: 8000,
      p_current_balance: 7000,
      p_annual_rate: 3,
      p_monthly_payment: 300,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/plan_not_active/);
  });

  it("denies anon save_debt_plan", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} anon`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-05-01",
      p_end_date: "2027-05-01",
      p_target_amount: 1000,
      p_original_amount: 1000,
      p_current_balance: 1000,
      p_annual_rate: 1,
      p_monthly_payment: 100,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(error).not.toBeNull();
  });

  it("rejects date shrink that would orphan an existing link", async () => {
    const created = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} shrink links`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-01-01",
      p_end_date: "2027-12-31",
      p_target_amount: 5000,
      p_original_amount: 5000,
      p_current_balance: 5000,
      p_annual_rate: 0,
      p_monthly_payment: 200,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(created.error).toBeNull();
    const planId = created.data!.plan.id as string;

    const cat = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} shrink cat`,
        type: "expense",
      })
      .select("id")
      .single();
    if (cat.error) throw cat.error;

    const tx = await ctx.admin
      .from("transactions")
      .insert({
        amount: 100,
        currency: "PLN",
        description: `${SENTINEL} linked pay`,
        date: "2026-06-15",
        type: "expense",
        status: "paid",
        category_id: cat.data.id,
        user_id: ctx.userA.userId,
        group_id: null,
      })
      .select("id")
      .single();
    if (tx.error) throw tx.error;

    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: tx.data.id,
    });
    expect(linked.error).toBeNull();

    const shrink = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: planId,
      p_name: `${SENTINEL} shrink links`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-01-01",
      p_end_date: "2026-03-31",
      p_target_amount: 5000,
      p_original_amount: 5000,
      p_current_balance: 5000,
      p_annual_rate: 0,
      p_monthly_payment: 200,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    expect(shrink.error).not.toBeNull();
    expect(shrink.error?.message ?? "").toMatch(/linked_transactions_incompatible/);
  });
});
