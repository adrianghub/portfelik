import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: shopping_lists", () => {
  let ctx: TestContext;
  let listAId: string;
  let listBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seed = async (userId: string, label: string) => {
      const { data, error } = await ctx.admin
        .from("shopping_lists")
        .insert({ user_id: userId, name: `${SENTINEL} ${label}` })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };

    listAId = await seed(ctx.userA.userId, "listA");
    listBId = await seed(ctx.userB.userId, "listB");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A sees own list", async () => {
    const { data } = await ctx.userA.client
      .from("shopping_lists")
      .select("id")
      .eq("id", listAId);
    expect(data?.length).toBe(1);
  });

  it("user A does NOT see user B's list (no shared group)", async () => {
    const { data, error } = await ctx.userA.client
      .from("shopping_lists")
      .select("id")
      .eq("id", listBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot update user B's list", async () => {
    const result = await ctx.userA.client
      .from("shopping_lists")
      .update({ name: `${SENTINEL} hacked` })
      .eq("id", listBId)
      .select();
    expectBlockedWrite(result);
  });

  it("user A cannot insert list with user_id = B", async () => {
    const result = await ctx.userA.client.from("shopping_lists").insert({
      user_id: ctx.userB.userId,
      name: `${SENTINEL} spoofed`,
    });
    expect(result.error).not.toBeNull();
  });
});
