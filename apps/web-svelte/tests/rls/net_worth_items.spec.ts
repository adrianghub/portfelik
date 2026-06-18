import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: net_worth_items", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    await ctx.admin
      .from("net_worth_items")
      .delete()
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);

    const { error: insertA } = await ctx.admin.from("net_worth_items").insert({
      user_id: ctx.userA.userId,
      label: "Konto A",
      amount: 5000,
      currency: "PLN",
      position: 0,
    });
    if (insertA) throw insertA;

    const { error: insertB } = await ctx.admin.from("net_worth_items").insert({
      user_id: ctx.userB.userId,
      label: "Konto B",
      amount: 9000,
      currency: "EUR",
      position: 0,
    });
    if (insertB) throw insertB;
  });

  afterAll(async () => {
    await ctx.admin
      .from("net_worth_items")
      .delete()
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own items", async () => {
    const { data, error } = await ctx.userA.client
      .from("net_worth_items")
      .select("label, amount")
      .eq("user_id", ctx.userA.userId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].label).toBe("Konto A");
  });

  it("user A cannot read user B items", async () => {
    const { data, error } = await ctx.userA.client
      .from("net_worth_items")
      .select("label")
      .eq("user_id", ctx.userB.userId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("user A cannot insert an item owned by user B", async () => {
    const result = await ctx.userA.client
      .from("net_worth_items")
      .insert({ user_id: ctx.userB.userId, label: "Hack", amount: 1, currency: "PLN" })
      .select();
    expectBlockedWrite(result);
  });

  it("user A cannot update user B items", async () => {
    const result = await ctx.userA.client
      .from("net_worth_items")
      .update({ amount: 1 })
      .eq("user_id", ctx.userB.userId)
      .select();
    expectBlockedWrite(result);
  });

  it("user A inserts and deletes own item", async () => {
    const { data, error } = await ctx.userA.client
      .from("net_worth_items")
      .insert({ user_id: ctx.userA.userId, label: "Inwestycje", amount: 1200, currency: "USD" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    const del = await ctx.userA.client.from("net_worth_items").delete().eq("id", data!.id).select();
    expect(del.error).toBeNull();
    expect(del.data?.length).toBe(1);
  });
});
