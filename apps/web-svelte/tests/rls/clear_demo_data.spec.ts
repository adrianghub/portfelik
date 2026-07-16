import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: clear_demo_data", () => {
  let ctx: TestContext;
  let expenseCatA: string;
  let expenseCatB: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const [catA, catB] = await Promise.all([
      ctx.admin
        .from("categories")
        .insert({
          user_id: ctx.userA.userId,
          name: `${SENTINEL} demo cat A`,
          type: "expense",
        })
        .select("id")
        .single(),
      ctx.admin
        .from("categories")
        .insert({
          user_id: ctx.userB.userId,
          name: `${SENTINEL} demo cat B`,
          type: "expense",
        })
        .select("id")
        .single(),
    ]);
    if (catA.error) throw catA.error;
    if (catB.error) throw catB.error;
    expenseCatA = catA.data.id;
    expenseCatB = catB.data.id;
  });

  beforeEach(async () => {
    await ctx.admin.from("transactions").delete().like("description", "Demo:%");
    await ctx.admin.from("plans").delete().like("name", "Demo:%");
    await ctx.admin.from("net_worth_items").delete().like("label", "Demo:%");

    const [tx, plan, item] = await Promise.all([
      ctx.admin.from("transactions").insert({
        amount: 10,
        currency: "PLN",
        description: "Demo: leftover tx",
        date: "2026-06-01",
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
      }),
      ctx.admin.from("plans").insert({
        name: "Demo: leftover plan",
        user_id: ctx.userA.userId,
        kind: "save",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        target_amount: 100,
      }),
      ctx.admin.from("net_worth_items").insert({
        user_id: ctx.userA.userId,
        label: "Demo: leftover asset",
        amount: 50,
        currency: "PLN",
        position: 0,
      }),
    ]);
    if (tx.error) throw tx.error;
    if (plan.error) throw plan.error;
    if (item.error) throw item.error;
  });

  afterAll(async () => {
    await ctx.admin.from("transactions").delete().like("description", "Demo:%");
    await ctx.admin.from("plans").delete().like("name", "Demo:%");
    await ctx.admin.from("net_worth_items").delete().like("label", "Demo:%");
    await cleanupSentinels(ctx.admin);
  });

  it("clears all Demo: rows for the caller in one call", async () => {
    const { data, error } = await ctx.userA.client.rpc("clear_demo_data");
    expect(error).toBeNull();
    expect(Number(data?.deleted)).toBeGreaterThanOrEqual(3);

    const txs = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("description", "Demo:%");
    expect(txs.data?.length ?? 0).toBe(0);

    const plans = await ctx.admin
      .from("plans")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("name", "Demo:%");
    expect(plans.data?.length ?? 0).toBe(0);

    const items = await ctx.admin
      .from("net_worth_items")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("label", "Demo:%");
    expect(items.data?.length ?? 0).toBe(0);
  });

  it("does not clear another user's Demo rows", async () => {
    const insertB = await ctx.admin.from("transactions").insert({
      amount: 20,
      currency: "PLN",
      description: "Demo: B only",
      date: "2026-06-02",
      type: "expense",
      status: "paid",
      category_id: expenseCatB,
      user_id: ctx.userB.userId,
    });
    if (insertB.error) throw insertB.error;

    await ctx.userA.client.rpc("clear_demo_data");

    const remaining = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userB.userId)
      .like("description", "Demo:%");
    expect(remaining.data?.length).toBe(1);
  });

  it("denies anon", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("clear_demo_data");
    expect(error).not.toBeNull();
  });
});
