import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: debt link balance sync", () => {
  let ctx: TestContext;
  let expenseCatA: string;

  async function ensureCategory(userId: string, name: string): Promise<string> {
    const existing = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .eq("type", "expense")
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;
    const created = await ctx.admin
      .from("categories")
      .insert({ user_id: userId, name, type: "expense" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id;
  }

  async function createDebtPlan(userId: string, name: string) {
    const { data, error } = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} ${name}`,
      p_group_id: null,
      p_category_id: null,
      p_start_date: "2026-01-01",
      p_end_date: "2027-12-31",
      p_target_amount: 10000,
      p_original_amount: 10000,
      p_current_balance: 10000,
      p_annual_rate: 0,
      p_monthly_payment: 500,
      p_first_payment_date: null,
      p_first_payment_amount: null,
      p_reset_balance_anchor: false,
      p_clear_balance_anchor: false,
    });
    if (error) throw error;
    // clear snapshot so liveBalance starts from original
    await ctx.admin
      .from("plan_debt_terms")
      .update({
        anchor_balance: null,
        balance_anchor_date: null,
        current_balance: 10000,
      })
      .eq("plan_id", data.plan.id);
    return data.plan.id as string;
  }

  async function createExpense(userId: string, amount: number, date: string) {
    const { data, error } = await ctx.admin
      .from("transactions")
      .insert({
        amount,
        currency: "PLN",
        description: `${SENTINEL} debt pay`,
        date,
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: userId,
        group_id: null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
    expenseCatA = await ensureCategory(ctx.userA.userId, `${SENTINEL} debt expense`);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("link reduces current_balance; unlink restores it (rate 0)", async () => {
    const planId = await createDebtPlan(ctx.userA.userId, "sync loan");
    const txId = await createExpense(ctx.userA.userId, 1500, "2026-06-15");

    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linked.error).toBeNull();

    const afterLink = await ctx.admin
      .from("plan_debt_terms")
      .select("current_balance")
      .eq("plan_id", planId)
      .single();
    expect(Number(afterLink.data?.current_balance)).toBe(8500);

    const unlinked = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlinked.error).toBeNull();

    const afterUnlink = await ctx.admin
      .from("plan_debt_terms")
      .select("current_balance")
      .eq("plan_id", planId)
      .single();
    expect(Number(afterUnlink.data?.current_balance)).toBe(10000);
  });

  it("save-plan link does not require debt terms", async () => {
    const plan = await ctx.admin
      .from("plans")
      .insert({
        name: `${SENTINEL} save no debt`,
        user_id: ctx.userA.userId,
        kind: "save",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        target_amount: 1000,
      })
      .select("id")
      .single();
    if (plan.error) throw plan.error;

    const txId = await createExpense(ctx.userA.userId, 100, "2026-06-01");
    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: plan.data.id,
      p_transaction_id: txId,
    });
    expect(linked.error).toBeNull();
  });

  it("group member can link and still sync balance (DEFINER)", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} debt-settle-group`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    if (member.error) throw member.error;

    const created = await ctx.userA.client.rpc("save_debt_plan", {
      p_plan_id: null,
      p_name: `${SENTINEL} group debt`,
      p_group_id: groupId,
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
    await ctx.admin
      .from("plan_debt_terms")
      .update({
        anchor_balance: null,
        balance_anchor_date: null,
        current_balance: 5000,
      })
      .eq("plan_id", planId);

    const tx = await ctx.admin
      .from("transactions")
      .insert({
        amount: 500,
        currency: "PLN",
        description: `${SENTINEL} group pay`,
        date: "2026-06-10",
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        group_id: groupId,
      })
      .select("id")
      .single();
    if (tx.error) throw tx.error;

    const linked = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: tx.data.id,
    });
    expect(linked.error).toBeNull();

    const terms = await ctx.admin
      .from("plan_debt_terms")
      .select("current_balance")
      .eq("plan_id", planId)
      .single();
    expect(Number(terms.data?.current_balance)).toBe(4500);
  });
});
