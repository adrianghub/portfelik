import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: shopping_item_categories", () => {
  let ctx: TestContext;
  let categoryAId: string;
  let categoryBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const categoryA = await ctx.admin
      .from("shopping_item_categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} userA shopping category`,
        position: 1,
      })
      .select("id")
      .single();
    if (categoryA.error) throw categoryA.error;
    categoryAId = categoryA.data.id;

    const categoryB = await ctx.admin
      .from("shopping_item_categories")
      .insert({
        user_id: ctx.userB.userId,
        name: `${SENTINEL} userB shopping category`,
        position: 1,
      })
      .select("id")
      .single();
    if (categoryB.error) throw categoryB.error;
    categoryBId = categoryB.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A sees own shopping item category", async () => {
    const { data, error } = await ctx.userA.client
      .from("shopping_item_categories")
      .select("id")
      .eq("id", categoryAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user A cannot see user B's shopping item category", async () => {
    const { data, error } = await ctx.userA.client
      .from("shopping_item_categories")
      .select("id")
      .eq("id", categoryBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A can create own shopping item category", async () => {
    const { data, error } = await ctx.userA.client
      .from("shopping_item_categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} userA created shopping category`,
        position: 2,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("user A cannot create a shopping item category owned by user B", async () => {
    const result = await ctx.userA.client.from("shopping_item_categories").insert({
      user_id: ctx.userB.userId,
      name: `${SENTINEL} spoofed shopping category`,
      position: 3,
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot update or delete user B's shopping item category", async () => {
    const update = await ctx.userA.client
      .from("shopping_item_categories")
      .update({ name: `${SENTINEL} hacked` })
      .eq("id", categoryBId)
      .select();
    expectBlockedWrite(update);

    const deletion = await ctx.userA.client
      .from("shopping_item_categories")
      .delete()
      .eq("id", categoryBId)
      .select();
    expectBlockedWrite(deletion);
  });
});
