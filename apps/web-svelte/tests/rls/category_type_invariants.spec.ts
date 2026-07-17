import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: category type invariants", () => {
  let ctx: TestContext;
  let expenseCatId: string;
  let incomeCatId: string;
  let unusedExpenseCatId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const expense = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} expense cat`,
        type: "expense",
      })
      .select("id")
      .single();
    if (expense.error) throw expense.error;
    expenseCatId = expense.data.id;

    const income = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} income cat`,
        type: "income",
      })
      .select("id")
      .single();
    if (income.error) throw income.error;
    incomeCatId = income.data.id;

    const unused = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} unused expense`,
        type: "expense",
      })
      .select("id")
      .single();
    if (unused.error) throw unused.error;
    unusedExpenseCatId = unused.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("rejects insert of income transaction with expense category", async () => {
    const result = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userA.userId,
      category_id: expenseCatId,
      description: `${SENTINEL} mismatch insert`,
      amount: 10,
      currency: "PLN",
      type: "income",
      date: "2026-07-01",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/category_type_mismatch/);
  });

  it("rejects updating an income transaction onto an expense category", async () => {
    const created = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        category_id: incomeCatId,
        description: `${SENTINEL} matching income`,
        amount: 20,
        currency: "PLN",
        type: "income",
        date: "2026-07-02",
      })
      .select("id")
      .single();
    expect(created.error).toBeNull();

    const updated = await ctx.userA.client
      .from("transactions")
      .update({ category_id: expenseCatId })
      .eq("id", created.data!.id);
    expect(updated.error).not.toBeNull();
    expect(updated.error?.message).toMatch(/category_type_mismatch/);
  });

  it("rejects flipping category type while a transaction references it", async () => {
    const tx = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userA.userId,
      category_id: expenseCatId,
      description: `${SENTINEL} anchors expense cat`,
      amount: 5,
      currency: "PLN",
      type: "expense",
      date: "2026-07-03",
    });
    expect(tx.error).toBeNull();

    const flip = await ctx.userA.client
      .from("categories")
      .update({ type: "income" })
      .eq("id", expenseCatId);
    expect(flip.error).not.toBeNull();
    expect(flip.error?.message).toMatch(/category_type_in_use/);
  });

  it("allows flipping category type when nothing references it", async () => {
    const flip = await ctx.userA.client
      .from("categories")
      .update({ type: "income" })
      .eq("id", unusedExpenseCatId)
      .select("id, type")
      .single();
    expect(flip.error).toBeNull();
    expect(flip.data?.type).toBe("income");

    // Restore so subsequent cleanup stays typed-expense sentinel-friendly.
    await ctx.userA.client
      .from("categories")
      .update({ type: "expense" })
      .eq("id", unusedExpenseCatId);
  });
});
