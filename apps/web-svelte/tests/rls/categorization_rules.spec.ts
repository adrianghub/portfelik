import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: categorization_rules", () => {
  let ctx: TestContext;
  let categoryAId: string;
  let ruleAId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const cat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} cat A`, type: "expense" })
      .select("id")
      .single();
    if (cat.error) throw cat.error;
    categoryAId = cat.data.id;

    const rule = await ctx.admin
      .from("categorization_rules")
      .insert({
        user_id: ctx.userA.userId,
        kind: "contains",
        match_description: "biedronka",
        category_id: categoryAId,
        priority: 300,
      })
      .select("id")
      .single();
    if (rule.error) throw rule.error;
    ruleAId = rule.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own rule", async () => {
    const { data, error } = await ctx.userA.client
      .from("categorization_rules")
      .select("id")
      .eq("id", ruleAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user B does NOT see user A's rule", async () => {
    const { data } = await ctx.userB.client
      .from("categorization_rules")
      .select("id")
      .eq("id", ruleAId);
    expect(data?.length).toBe(0);
  });

  it("check constraint: 'exact' requires description or counterparty", async () => {
    const bad = await ctx.userA.client.from("categorization_rules").insert({
      user_id: ctx.userA.userId,
      kind: "exact",
      category_id: categoryAId,
      priority: 400,
    });
    expect(bad.error).not.toBeNull();
  });

  it("check constraint: 'type' requires match_type", async () => {
    const bad = await ctx.userA.client.from("categorization_rules").insert({
      user_id: ctx.userA.userId,
      kind: "type",
      category_id: categoryAId,
      priority: 100,
    });
    expect(bad.error).not.toBeNull();
  });

  it("check constraint: 'composite' requires both desc/counterparty and type", async () => {
    const missingType = await ctx.userA.client.from("categorization_rules").insert({
      user_id: ctx.userA.userId,
      kind: "composite",
      match_description: "spotify",
      category_id: categoryAId,
      priority: 350,
    });
    expect(missingType.error).not.toBeNull();

    const ok = await ctx.userA.client.from("categorization_rules").insert({
      user_id: ctx.userA.userId,
      kind: "composite",
      match_description: "spotify",
      match_type: "expense",
      category_id: categoryAId,
      priority: 350,
    });
    expect(ok.error).toBeNull();
  });

  it("client cannot change user_id (column-level grant)", async () => {
    await ctx.userA.client
      .from("categorization_rules")
      .update({ user_id: ctx.userB.userId } as never)
      .eq("id", ruleAId);
    const after = await ctx.admin
      .from("categorization_rules")
      .select("user_id")
      .eq("id", ruleAId)
      .single();
    expect(after.data?.user_id).toBe(ctx.userA.userId);
  });

  it("user A can DELETE own rule", async () => {
    const del = await ctx.userA.client.from("categorization_rules").delete().eq("id", ruleAId);
    expect(del.error).toBeNull();
  });
});
