import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

/**
 * Functional coverage for the atomic refinance RPC. The point of moving refinance
 * into one Postgres transaction is that it can never leave the old loan active while
 * the replacement is also active (double-count), and that a caller cannot refinance a
 * plan they do not manage. Both are asserted here against real RLS.
 */
describe("RPC: refinance_debt_plan (atomic)", () => {
  let ctx: TestContext;
  let oldPlanId: string;

  async function seedActiveDebtPlan(name: string, target = 200000): Promise<string> {
    const { data, error } = await ctx.userA.client
      .from("plans")
      .insert({
        name,
        user_id: ctx.userA.userId,
        kind: "debt",
        target_amount: target,
        start_date: "2026-01-01",
        end_date: "2036-01-01",
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    const planId = (data as { id: string }).id;
    const { error: termsErr } = await ctx.userA.client.from("plan_debt_terms").insert({
      plan_id: planId,
      original_amount: target,
      current_balance: target,
      annual_rate: 6,
      monthly_payment: 2000,
    });
    if (termsErr) throw termsErr;
    return planId;
  }

  const refiArgs = (oldId: string, name: string) => ({
    p_old_plan_id: oldId,
    p_name: name,
    p_group_id: null,
    p_category_id: null,
    p_target_amount: 207000,
    p_start_date: "2026-06-12",
    p_end_date: "2036-10-10",
    p_annual_rate: 5.96,
    p_monthly_payment: 2255.01,
    p_first_payment_date: "2026-08-10",
    p_first_payment_amount: null,
  });

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    oldPlanId = await seedActiveDebtPlan(`${SENTINEL} refi old`);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("archives the old plan and creates a new active linked plan + terms in one call", async () => {
    const { data: newId, error } = await ctx.userA.client.rpc(
      "refinance_debt_plan",
      refiArgs(oldPlanId, `${SENTINEL} refi new`),
    );
    expect(error).toBeNull();
    expect(typeof newId).toBe("string");

    const { data: oldPlan } = await ctx.userA.client
      .from("plans")
      .select("status, replaced_by_plan_id")
      .eq("id", oldPlanId)
      .single();
    expect(oldPlan?.status).toBe("refinanced");
    expect(oldPlan?.replaced_by_plan_id).toBe(newId);

    const { data: newPlan } = await ctx.userA.client
      .from("plans")
      .select("status, kind, refinanced_from_plan_id")
      .eq("id", newId as string)
      .single();
    expect(newPlan?.status).toBe("active");
    expect(newPlan?.kind).toBe("debt");
    expect(newPlan?.refinanced_from_plan_id).toBe(oldPlanId);

    const { data: newTerms } = await ctx.userA.client
      .from("plan_debt_terms")
      .select("monthly_payment, current_balance")
      .eq("plan_id", newId as string)
      .single();
    expect(Number(newTerms?.monthly_payment)).toBe(2255.01);
    expect(Number(newTerms?.current_balance)).toBe(207000);
  });

  it("rolls back entirely when the old plan is already refinanced (status guard)", async () => {
    const before = await ctx.userA.client
      .from("plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userA.userId);

    // oldPlanId is now 'refinanced' from the previous test → guard raises.
    const { error } = await ctx.userA.client.rpc(
      "refinance_debt_plan",
      refiArgs(oldPlanId, `${SENTINEL} refi dup`),
    );
    expect(error).not.toBeNull();

    const after = await ctx.userA.client
      .from("plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userA.userId);
    expect(after.count).toBe(before.count); // no orphan plan created

    const { data: dup } = await ctx.userA.client
      .from("plans")
      .select("id")
      .eq("name", `${SENTINEL} refi dup`);
    expect(dup?.length ?? 0).toBe(0);
  });

  it("user B cannot refinance user A's plan (cross-user write rolls back)", async () => {
    const aPlanId = await seedActiveDebtPlan(`${SENTINEL} refi A2`, 100000);

    // B's new-plan insert sets user_id = B (auth.uid()), so it would succeed on its own,
    // but the old-plan UPDATE matches 0 rows under B's RLS → NOT FOUND → raise → full rollback.
    const { error } = await ctx.userB.client.rpc(
      "refinance_debt_plan",
      refiArgs(aPlanId, `${SENTINEL} refi B-steal`),
    );
    expect(error).not.toBeNull();

    // A's plan is untouched.
    const { data: aPlan } = await ctx.userA.client
      .from("plans")
      .select("status")
      .eq("id", aPlanId)
      .single();
    expect(aPlan?.status).toBe("active");

    // No partial B plan persisted.
    const { data: stolen } = await ctx.userB.client
      .from("plans")
      .select("id")
      .eq("name", `${SENTINEL} refi B-steal`);
    expect(stolen?.length ?? 0).toBe(0);
  });
});
