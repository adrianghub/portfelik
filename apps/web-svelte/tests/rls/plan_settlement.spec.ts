import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: plan settlement", () => {
  let ctx: TestContext;
  let categoryAId: string;
  let categoryBId: string;

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

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    categoryAId = await ensureCategory(ctx.userA.userId, "RLS plan settlement cat A");
    categoryBId = await ensureCategory(ctx.userB.userId, "RLS plan settlement cat B");
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("links an expense transaction to a plan for the owner", async () => {
    const { data: plan, error: planError } = await ctx.userA.client
      .from("shopping_lists")
      .insert({
        name: `${SENTINEL} plan`,
        user_id: ctx.userA.userId,
        planned_for: "2026-06-01",
      })
      .select("id")
      .single();
    expect(planError).toBeNull();

    const { data: tx, error: txError } = await ctx.userA.client
      .from("transactions")
      .insert({
        amount: 42,
        currency: "PLN",
        description: `${SENTINEL} expense`,
        date: "2026-06-02",
        type: "expense",
        category_id: categoryAId,
        user_id: ctx.userA.userId,
      })
      .select("id")
      .single();
    expect(txError).toBeNull();

    const { data: link, error: linkError } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: plan!.id,
      p_transaction_id: tx!.id,
    });
    expect(linkError).toBeNull();
    expect(link?.plan_id).toBe(plan!.id);
    expect(link?.transaction_id).toBe(tx!.id);

    const { error: unlinkError } = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: plan!.id,
      p_transaction_id: tx!.id,
    });
    expect(unlinkError).toBeNull();
  });

  it("blocks user B from linking to user A private plan", async () => {
    const { data: plan, error: planError } = await ctx.userA.client
      .from("shopping_lists")
      .insert({
        name: `${SENTINEL} private plan`,
        user_id: ctx.userA.userId,
        planned_for: "2026-06-01",
      })
      .select("id")
      .single();
    expect(planError).toBeNull();

    const { data: tx, error: txError } = await ctx.userB.client
      .from("transactions")
      .insert({
        amount: 10,
        currency: "PLN",
        description: `${SENTINEL} b tx`,
        date: "2026-06-02",
        type: "expense",
        category_id: categoryBId,
        user_id: ctx.userB.userId,
      })
      .select("id")
      .single();
    expect(txError).toBeNull();

    const { error } = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: plan!.id,
      p_transaction_id: tx!.id,
    });
    expect(error).not.toBeNull();
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
