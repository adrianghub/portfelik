import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: categories", () => {
  let ctx: TestContext;
  let catAId: string;
  let catBId: string;
  let systemCatId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seed = async (userId: string | null, label: string) => {
      const { data, error } = await ctx.admin
        .from("categories")
        .insert({ user_id: userId, name: `${SENTINEL} ${label}`, type: "expense" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };

    catAId = await seed(ctx.userA.userId, "userA");
    catBId = await seed(ctx.userB.userId, "userB");
    systemCatId = await seed(null, "system");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A sees own category", async () => {
    const { data } = await ctx.userA.client.from("categories").select("id").eq("id", catAId);
    expect(data?.length).toBe(1);
  });

  it("user A sees system category (user_id IS NULL)", async () => {
    const { data } = await ctx.userA.client.from("categories").select("id").eq("id", systemCatId);
    expect(data?.length).toBe(1);
  });

  it("user A cannot see user B's private category", async () => {
    const { data, error } = await ctx.userA.client
      .from("categories")
      .select("id")
      .eq("id", catBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot update system category", async () => {
    const result = await ctx.userA.client
      .from("categories")
      .update({ name: `${SENTINEL} hacked` })
      .eq("id", systemCatId)
      .select();
    expectBlockedWrite(result);
  });

  it("user A cannot delete user B's category", async () => {
    const result = await ctx.userA.client.from("categories").delete().eq("id", catBId).select();
    expectBlockedWrite(result);
  });
});
