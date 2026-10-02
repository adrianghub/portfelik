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

  it("keeps presentation choices private and rejects unsupported values", async () => {
    const saved = await ctx.userA.client
      .from("categories")
      .update({ color: "#38bdf8", icon: "home" })
      .eq("id", catAId)
      .select("color, icon")
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({ color: "#38bdf8", icon: "home" });
    expectBlockedWrite(
      await ctx.userB.client
        .from("categories")
        .update({ color: "#fb7185" })
        .eq("id", catAId)
        .select()
    );
    expect(
      (await ctx.userA.client.from("categories").update({ color: "url(unsafe)" }).eq("id", catAId))
        .error?.code
    ).toBe("23514");
    expect(
      (await ctx.userA.client.from("categories").update({ icon: "unsupported" }).eq("id", catAId))
        .error?.code
    ).toBe("23514");
  });

  it("keeps seeded fallback categories active", async () => {
    const defaults = await ctx.userA.client
      .from("categories")
      .select("id, name")
      .in("name", ["Inne wydatki", "Inne przychody"]);
    expect(defaults.data?.length).toBe(2);
    for (const category of defaults.data!) {
      const archived = await ctx.userA.client
        .from("categories")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", category.id);
      expect(archived.error?.code).toBe("23514");
    }
  });

  it("archives without losing historical labels or rules and rejects new assignments", async () => {
    const category = await ctx.userA.client
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} archival`, type: "expense" })
      .select("id")
      .single();
    expect(category.error).toBeNull();
    const id = category.data!.id;
    const input = {
      user_id: ctx.userA.userId,
      category_id: id,
      amount: 20,
      type: "expense",
      status: "paid",
      date: "2026-09-13",
      description: `${SENTINEL} historical purchase`,
    };
    const transaction = await ctx.userA.client
      .from("transactions")
      .insert(input)
      .select("id")
      .single();
    expect(transaction.error).toBeNull();
    const rule = await ctx.userA.client
      .from("categorization_rules")
      .insert({
        user_id: ctx.userA.userId,
        category_id: id,
        kind: "contains",
        match_description: `${SENTINEL} archival merchant`,
      })
      .select("id")
      .single();
    expect(rule.error).toBeNull();
    const archived = await ctx.userA.client
      .from("categories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    expect(archived.error).toBeNull();
    const history = await ctx.userA.client
      .from("transactions_with_category")
      .select("category_id, category_name")
      .eq("id", transaction.data!.id)
      .single();
    expect(history.data).toEqual({ category_id: id, category_name: `${SENTINEL} archival` });
    expect(
      (
        await ctx.userA.client
          .from("transactions")
          .update({ description: `${SENTINEL} corrected label` })
          .eq("id", transaction.data!.id)
      ).error
    ).toBeNull();
    expect((await ctx.userA.client.from("transactions").insert(input)).error?.code).toBe("23514");
    expect(
      (
        await ctx.userA.client
          .from("plans")
          .insert({
            user_id: ctx.userA.userId,
            name: `${SENTINEL} plan archival`,
            kind: "save",
            target_amount: 100,
            start_date: "2026-10-01",
            end_date: "2026-10-31",
            category_id: id,
          })
          .select("id")
      ).error?.code
    ).toBe("23514");
    const keptPlan = await ctx.userA.client
      .from("plans")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} plan historical`,
        kind: "save",
        target_amount: 100,
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        category_id: null,
      })
      .select("id")
      .single();
    expect(keptPlan.error).toBeNull();
    expect(
      (
        await ctx.userA.client
          .from("plans")
          .update({ category_id: id })
          .eq("id", keptPlan.data!.id)
      ).error?.code
    ).toBe("23514");
    const storedRule = await ctx.userA.client
      .from("categorization_rules")
      .select("category_id")
      .eq("id", rule.data!.id)
      .single();
    expect(storedRule.data?.category_id).toBe(id);
    expect((await ctx.userA.client.from("categories").delete().eq("id", id)).error?.code).toBe(
      "23503"
    );
    expect(
      (await ctx.userA.client.from("categories").update({ archived_at: null }).eq("id", id)).error
    ).toBeNull();
    expect((await ctx.userA.client.from("transactions").insert(input)).error).toBeNull();
  });

  it("user A cannot see a NULL-user (legacy system) category", async () => {
    // Categories are now strictly per-user; the system read path was removed.
    const { data } = await ctx.userA.client.from("categories").select("id").eq("id", systemCatId);
    expect(data?.length).toBe(0);
  });

  it("user A cannot see user B's private category", async () => {
    const { data, error } = await ctx.userA.client.from("categories").select("id").eq("id", catBId);
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

  describe("group membership does not share categories", () => {
    beforeAll(async () => {
      const { data: groupData, error: groupErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} cat group`,
      });
      if (groupErr || !groupData) throw groupErr ?? new Error("no group");
      const groupId = (groupData as { id: string }).id;

      const memberInsert = await ctx.admin.from("group_members").insert({
        group_id: groupId,
        user_id: ctx.userB.userId,
      });
      if (memberInsert.error) throw memberInsert.error;
    });

    it("user A in a shared group still cannot see user B's category", async () => {
      const { data, error } = await ctx.userA.client
        .from("categories")
        .select("id")
        .eq("id", catBId);
      expect(error).toBeNull();
      expect(data?.length).toBe(0);
    });
  });
});
