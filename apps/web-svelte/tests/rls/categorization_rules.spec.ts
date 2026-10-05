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

  it("new rules default to ALL without changing the text values", async () => {
    const { data, error } = await ctx.userA.client
      .from("categorization_rules")
      .select("match_operator,match_description,match_counterparty")
      .eq("id", ruleAId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      match_operator: "all",
      match_description: "biedronka",
      match_counterparty: null,
    });
  });

  it("legacy ANY is preserved while editing conditions; clients cannot switch its operator", async () => {
    const created = await ctx.admin
      .from("categorization_rules")
      .insert({
        user_id: ctx.userA.userId,
        kind: "contains",
        match_operator: "any",
        match_description: "legacy merchant",
        match_counterparty: "legacy merchant",
        category_id: categoryAId,
        priority: 302,
      })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    const edited = await ctx.userA.client
      .from("categorization_rules")
      .update({ match_description: "legacy edited" })
      .eq("id", created.data!.id)
      .select("match_operator")
      .single();
    expect(edited.error).toBeNull();
    expect(edited.data?.match_operator).toBe("any");
    const denied = await ctx.userA.client
      .from("categorization_rules")
      .update({ match_operator: "all" })
      .eq("id", created.data!.id);
    expect(denied.error).not.toBeNull();
  });

  it("rejects an unknown text operator", async () => {
    const bad = await ctx.userA.client.from("categorization_rules").insert({
      user_id: ctx.userA.userId,
      kind: "contains",
      match_operator: "either",
      match_description: "invalid operator",
      category_id: categoryAId,
    });
    expect(bad.error?.code).toBe("23514");
  });

  it("duplicate identity distinguishes ALL and ANY with two conditions", async () => {
    const input = {
      user_id: ctx.userA.userId,
      kind: "contains" as const,
      match_description: "operator identity",
      match_counterparty: "actual counterparty",
      category_id: categoryAId,
    };
    expect(
      (
        await ctx.userA.client
          .from("categorization_rules")
          .insert({ ...input, match_operator: "all" })
      ).error
    ).toBeNull();
    expect(
      (
        await ctx.userA.client
          .from("categorization_rules")
          .insert({ ...input, match_operator: "any" })
      ).error
    ).toBeNull();
    expect(
      (
        await ctx.userA.client
          .from("categorization_rules")
          .insert({ ...input, match_operator: "all" })
      ).error?.code
    ).toBe("23505");
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

  it("unique guard blocks duplicate rule identity after normalization", async () => {
    const dup = await ctx.userA.client.from("categorization_rules").insert({
      user_id: ctx.userA.userId,
      kind: "contains",
      match_description: "  BIEDRONKA  ",
      category_id: categoryAId,
      priority: 100,
    });
    expect(dup.error).not.toBeNull();
    expect(dup.error?.code).toBe("23505");
  });

  it("client can update match_day_of_month", async () => {
    const upd = await ctx.userA.client
      .from("categorization_rules")
      .update({ match_day_of_month: 15 })
      .eq("id", ruleAId)
      .select("match_day_of_month")
      .single();
    expect(upd.error).toBeNull();
    expect(upd.data?.match_day_of_month).toBe(15);
  });

  it("rejects kind changes and clearing required match_type", async () => {
    const kindFlip = await ctx.admin
      .from("categorization_rules")
      .update({ kind: "exact" })
      .eq("id", ruleAId);
    expect(kindFlip.error).not.toBeNull();
    expect(kindFlip.error?.message ?? "").toMatch(/rule_kind_immutable/);

    const composite = await ctx.userA.client
      .from("categorization_rules")
      .insert({
        user_id: ctx.userA.userId,
        kind: "composite",
        match_description: `${SENTINEL} semantics-lock`,
        match_type: "expense",
        category_id: categoryAId,
        priority: 120,
      })
      .select("id")
      .single();
    expect(composite.error).toBeNull();

    const clearType = await ctx.userA.client
      .from("categorization_rules")
      .update({ match_type: null })
      .eq("id", composite.data!.id);
    expect(clearType.error).not.toBeNull();
    expect(clearType.error?.message ?? "").toMatch(/rule_match_type_required/);

    const typeOnly = await ctx.userA.client
      .from("categorization_rules")
      .insert({
        user_id: ctx.userA.userId,
        kind: "type",
        match_type: "expense",
        category_id: categoryAId,
        priority: 90,
      })
      .select("id")
      .single();
    expect(typeOnly.error).toBeNull();

    const catOnly = await ctx.userA.client
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} type-cat`, type: "expense" })
      .select("id")
      .single();
    expect(catOnly.error).toBeNull();

    const keepType = await ctx.userA.client
      .from("categorization_rules")
      .update({ category_id: catOnly.data!.id })
      .eq("id", typeOnly.data!.id)
      .select("kind, match_type, category_id")
      .single();
    expect(keepType.error).toBeNull();
    expect(keepType.data).toMatchObject({
      kind: "type",
      match_type: "expense",
      category_id: catOnly.data!.id,
    });
  });

  it("user A can DELETE own rule", async () => {
    const del = await ctx.userA.client.from("categorization_rules").delete().eq("id", ruleAId);
    expect(del.error).toBeNull();
  });
});
