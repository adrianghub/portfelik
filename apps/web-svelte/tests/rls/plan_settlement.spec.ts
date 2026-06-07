import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

type TxType = "expense" | "income";

describe("RPC: plan settlement", () => {
  let ctx: TestContext;
  let expenseCategoryAId: string;
  let incomeCategoryAId: string;
  let expenseCategoryBId: string;

  async function ensureCategory(userId: string, name: string, type: TxType): Promise<string> {
    const existing = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .eq("type", type)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;

    const created = await ctx.admin
      .from("categories")
      .insert({ user_id: userId, name, type })
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

  async function createTx(opts: {
    userId: string;
    description: string;
    type: TxType;
    categoryId: string;
    date?: string;
    groupId?: string | null;
  }) {
    const { data, error } = await ctx.admin
      .from("transactions")
      .insert({
        amount: opts.type === "income" ? 500 : 42,
        currency: "PLN",
        description: `${SENTINEL} ${opts.description}`,
        date: opts.date ?? "2026-06-02",
        type: opts.type,
        category_id: opts.categoryId,
        user_id: opts.userId,
        group_id: opts.groupId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    expenseCategoryAId = await ensureCategory(
      ctx.userA.userId,
      "RLS plan settlement expense A",
      "expense"
    );
    incomeCategoryAId = await ensureCategory(
      ctx.userA.userId,
      "RLS plan settlement income A",
      "income"
    );
    expenseCategoryBId = await ensureCategory(
      ctx.userB.userId,
      "RLS plan settlement expense B",
      "expense"
    );
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("links and unlinks an expense transaction to a private plan for the owner", async () => {
    const planId = await createPlan(ctx.userA.userId, "expense plan");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "expense",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const { data: link, error: linkError } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linkError).toBeNull();
    expect(link?.plan_id).toBe(planId);
    expect(link?.transaction_id).toBe(txId);

    const { error: unlinkError } = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlinkError).toBeNull();
  });

  it("links income transactions as plan funding", async () => {
    const planId = await createPlan(ctx.userA.userId, "income plan");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "income",
      type: "income",
      categoryId: incomeCategoryAId,
    });

    const { data, error } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).toBeNull();
    expect(data?.transaction_id).toBe(txId);
  });

  it("rejects transactions outside the plan period", async () => {
    const planId = await createPlan(ctx.userA.userId, "period plan");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "outside period",
      type: "expense",
      categoryId: expenseCategoryAId,
      date: "2026-07-02",
    });

    const { error } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/transaction_outside_plan_period/);
  });

  it("blocks user B from linking to user A private plan", async () => {
    const planId = await createPlan(ctx.userA.userId, "private plan");
    const txId = await createTx({
      userId: ctx.userB.userId,
      description: "b tx",
      type: "expense",
      categoryId: expenseCategoryBId,
    });

    const { error } = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).not.toBeNull();
  });

  it("allows group member to link group transaction to shared plan", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} settlement-group`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    if (member.error) throw member.error;

    const planId = await createPlan(ctx.userA.userId, "shared settle", groupId);
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "shared expense",
      type: "expense",
      categoryId: expenseCategoryAId,
      groupId,
    });

    const { data: link, error: linkError } = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linkError).toBeNull();
    expect(link?.plan_id).toBe(planId);

    const { error: unlinkError } = await ctx.userB.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlinkError).toBeNull();
  });

  it("rejects private plan to group transaction scope mismatch", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} settlement-scope`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const planId = await createPlan(ctx.userA.userId, "private scope");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "group tx",
      type: "expense",
      categoryId: expenseCategoryAId,
      groupId,
    });

    const { error } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/private_scope_mismatch/);
  });

  it("rejects linking one transaction to two plans", async () => {
    const planAId = await createPlan(ctx.userA.userId, "one tx A");
    const planBId = await createPlan(ctx.userA.userId, "one tx B");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "one tx",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const first = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planAId,
      p_transaction_id: txId,
    });
    expect(first.error).toBeNull();

    const second = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planBId,
      p_transaction_id: txId,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? "").toMatch(/transaction_already_linked/);
  });

  it("denies anon link_plan_transaction", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("link_plan_transaction", {
      p_plan_id: "00000000-0000-4000-8000-000000000001",
      p_transaction_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(error).not.toBeNull();
  });

  it("denies anon unlink_plan_transaction", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("unlink_plan_transaction", {
      p_plan_id: "00000000-0000-4000-8000-000000000001",
      p_transaction_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(error).not.toBeNull();
  });
});
