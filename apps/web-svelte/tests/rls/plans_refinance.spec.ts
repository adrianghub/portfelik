import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

// Refinance writes the old plan's status -> 'refinanced' and replaced_by_plan_id,
// and inserts a new plan carrying refinanced_from_plan_id. These columns are gated
// by the existing row-level "plans: update own or co-owner" policy - no column-level
// restriction - so they must follow the same owner/co-owner write rules.
describe("RLS: plans refinance columns", () => {
  let ctx: TestContext;
  let oldPlanAId: string;
  let newPlanAId: string;
  let planBId: string;

  const seedDebtPlan = async (userId: string, label: string, groupId: string | null = null) => {
    const { data, error } = await ctx.admin
      .from("plans")
      .insert({
        user_id: userId,
        name: `${SENTINEL} ${label}`,
        kind: "debt",
        group_id: groupId,
        start_date: "2026-01-01",
        end_date: "2036-01-01",
        target_amount: 330000,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    oldPlanAId = await seedDebtPlan(ctx.userA.userId, "old-debtA");
    newPlanAId = await seedDebtPlan(ctx.userA.userId, "new-debtA");
    planBId = await seedDebtPlan(ctx.userB.userId, "debtB");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("owner can mark own plan refinanced and link the replacement", async () => {
    const result = await ctx.userA.client
      .from("plans")
      .update({ status: "refinanced", replaced_by_plan_id: newPlanAId })
      .eq("id", oldPlanAId)
      .select("status, replaced_by_plan_id")
      .single();
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe("refinanced");
    expect(result.data?.replaced_by_plan_id).toBe(newPlanAId);
  });

  it("owner can set refinanced_from_plan_id on the new plan", async () => {
    const result = await ctx.userA.client
      .from("plans")
      .update({ refinanced_from_plan_id: oldPlanAId })
      .eq("id", newPlanAId)
      .select("refinanced_from_plan_id")
      .single();
    expect(result.error).toBeNull();
    expect(result.data?.refinanced_from_plan_id).toBe(oldPlanAId);
  });

  it("user A cannot mark user B's plan refinanced", async () => {
    const result = await ctx.userA.client
      .from("plans")
      .update({ status: "refinanced", replaced_by_plan_id: newPlanAId })
      .eq("id", planBId)
      .select();
    expectBlockedWrite(result);
  });

  describe("group-shared refinance writes", () => {
    let groupId: string;
    let sharedPlanId: string;

    beforeAll(async () => {
      const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} refi-group`,
      });
      if (groupError || !group) throw groupError ?? new Error("no group");
      groupId = (group as { id: string }).id;

      const member = await ctx.admin.from("group_members").insert({
        group_id: groupId,
        user_id: ctx.userB.userId,
      });
      if (member.error) throw member.error;

      sharedPlanId = await seedDebtPlan(ctx.userA.userId, "shared-debt", groupId);
    });

    it("plain group member cannot mark shared plan refinanced", async () => {
      const result = await ctx.userB.client
        .from("plans")
        .update({ status: "refinanced" })
        .eq("id", sharedPlanId)
        .select();
      expectBlockedWrite(result);
    });

    it("co-owner can mark shared plan refinanced", async () => {
      const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
        p_group_id: groupId,
        p_user_id: ctx.userB.userId,
      });
      expect(nominate.error).toBeNull();

      const result = await ctx.userB.client
        .from("plans")
        .update({ status: "refinanced" })
        .eq("id", sharedPlanId)
        .select("status")
        .single();
      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("refinanced");
    });
  });
});
