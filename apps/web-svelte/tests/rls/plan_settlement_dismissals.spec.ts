import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: plan_settlement_dismissals", () => {
  let ctx: TestContext;
  let expenseCategoryAId: string;

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

  async function createPlan(userId: string, name: string, groupId: string | null = null) {
    const { data, error } = await ctx.admin
      .from("plans")
      .insert({
        name: `${SENTINEL} ${name}`,
        user_id: userId,
        group_id: groupId,
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        budget_amount: 1000,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function createTx(userId: string, description: string, groupId: string | null = null) {
    const { data, error } = await ctx.admin
      .from("transactions")
      .insert({
        amount: 42,
        currency: "PLN",
        description: `${SENTINEL} ${description}`,
        date: "2026-06-02",
        type: "expense",
        category_id: expenseCategoryAId,
        user_id: userId,
        group_id: groupId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    expenseCategoryAId = await ensureCategory(ctx.userA.userId, "RLS dismissals expense A");
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("owner can dismiss, read, and undo a dismissal on a private plan", async () => {
    const planId = await createPlan(ctx.userA.userId, "dismiss plan");
    const txId = await createTx(ctx.userA.userId, "dismiss tx");

    const insert = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .insert({ plan_id: planId, transaction_id: txId, dismissed_by: ctx.userA.userId });
    expect(insert.error).toBeNull();

    const select = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .select("transaction_id")
      .eq("plan_id", planId);
    expect(select.error).toBeNull();
    expect(select.data?.map((r) => r.transaction_id)).toContain(txId);

    const del = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .delete()
      .eq("plan_id", planId)
      .eq("transaction_id", txId);
    expect(del.error).toBeNull();

    const after = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .select("id")
      .eq("plan_id", planId);
    expect(after.data ?? []).toHaveLength(0);
  });

  it("blocks user B from dismissing on user A private plan", async () => {
    const planId = await createPlan(ctx.userA.userId, "private dismiss");
    const txId = await createTx(ctx.userA.userId, "private dismiss tx");

    const insert = await ctx.userB.client
      .from("plan_settlement_dismissals")
      .insert({ plan_id: planId, transaction_id: txId, dismissed_by: ctx.userB.userId });
    expect(insert.error).not.toBeNull();
  });

  it("hides user A private dismissals from user B", async () => {
    const planId = await createPlan(ctx.userA.userId, "hidden dismiss");
    const txId = await createTx(ctx.userA.userId, "hidden dismiss tx");

    const insert = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .insert({ plan_id: planId, transaction_id: txId, dismissed_by: ctx.userA.userId });
    expect(insert.error).toBeNull();

    const select = await ctx.userB.client
      .from("plan_settlement_dismissals")
      .select("id")
      .eq("plan_id", planId);
    expect(select.error).toBeNull();
    expect(select.data ?? []).toHaveLength(0);
  });

  it("rejects dismissed_by spoofing", async () => {
    const planId = await createPlan(ctx.userA.userId, "spoof dismiss");
    const txId = await createTx(ctx.userA.userId, "spoof dismiss tx");

    const insert = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .insert({ plan_id: planId, transaction_id: txId, dismissed_by: ctx.userB.userId });
    expect(insert.error).not.toBeNull();
  });

  it("group member can dismiss on a shared plan and the dismissal is shared", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} dismissals-group`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    if (member.error) throw member.error;

    const planId = await createPlan(ctx.userA.userId, "shared dismiss", groupId);
    const txId = await createTx(ctx.userA.userId, "shared dismiss tx", groupId);

    const insert = await ctx.userB.client
      .from("plan_settlement_dismissals")
      .insert({ plan_id: planId, transaction_id: txId, dismissed_by: ctx.userB.userId });
    expect(insert.error).toBeNull();

    const ownerView = await ctx.userA.client
      .from("plan_settlement_dismissals")
      .select("transaction_id")
      .eq("plan_id", planId);
    expect(ownerView.error).toBeNull();
    expect(ownerView.data?.map((r) => r.transaction_id)).toContain(txId);
  });

  it("denies anon access entirely", async () => {
    const anon = createAnonClient();
    const select = await anon.from("plan_settlement_dismissals").select("id").limit(1);
    expect(select.error).not.toBeNull();

    const insert = await anon.from("plan_settlement_dismissals").insert({
      plan_id: "00000000-0000-4000-8000-000000000001",
      transaction_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(insert.error).not.toBeNull();
  });
});
