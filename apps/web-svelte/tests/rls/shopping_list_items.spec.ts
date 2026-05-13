import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: shopping_list_items", () => {
  let ctx: TestContext;
  let listBId: string;
  let itemBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const list = await ctx.admin
      .from("shopping_lists")
      .insert({ user_id: ctx.userB.userId, name: `${SENTINEL} B list` })
      .select("id")
      .single();
    if (list.error) throw list.error;
    listBId = list.data.id;

    const item = await ctx.admin
      .from("shopping_list_items")
      .insert({ shopping_list_id: listBId, name: `${SENTINEL} B item` })
      .select("id")
      .single();
    if (item.error) throw item.error;
    itemBId = item.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A does NOT see items in user B's list", async () => {
    const { data, error } = await ctx.userA.client
      .from("shopping_list_items")
      .select("id")
      .eq("id", itemBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot add item to user B's list", async () => {
    const result = await ctx.userA.client.from("shopping_list_items").insert({
      shopping_list_id: listBId,
      name: `${SENTINEL} spoofed item`,
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot delete item in user B's list", async () => {
    const result = await ctx.userA.client
      .from("shopping_list_items")
      .delete()
      .eq("id", itemBId)
      .select();
    expectBlockedWrite(result);
  });
});
