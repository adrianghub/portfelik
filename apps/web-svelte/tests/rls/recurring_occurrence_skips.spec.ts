import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: recurring_occurrence_skips", () => {
  let ctx: TestContext;
  let categoryId: string;

  async function ensureCategory(): Promise<string> {
    const existing = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .eq("name", `${SENTINEL} recurring skips`)
      .eq("type", "expense")
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;

    const created = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} recurring skips`, type: "expense" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id as string;
  }

  async function createTemplate(): Promise<string> {
    const { data, error } = await ctx.admin
      .from("transactions")
      .insert({
        amount: 100,
        currency: "PLN",
        description: `${SENTINEL} recurring skip template`,
        date: "2026-07-01",
        type: "expense",
        category_id: categoryId,
        user_id: ctx.userA.userId,
        is_recurring: true,
        recurring_day: 1,
        recurrence_frequency: "monthly",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    categoryId = await ensureCategory();
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
    categoryId = await ensureCategory();
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("owner can insert and read a private skip", async () => {
    const templateId = await createTemplate();

    const insert = await ctx.userA.client.from("recurring_occurrence_skips").insert({
      user_id: ctx.userA.userId,
      recurring_template_id: templateId,
      occurrence_date: "2026-08-01",
      created_by: ctx.userA.userId,
    });
    expect(insert.error).toBeNull();

    const select = await ctx.userA.client
      .from("recurring_occurrence_skips")
      .select("occurrence_date")
      .eq("recurring_template_id", templateId);
    expect(select.error).toBeNull();
    expect(select.data?.map((r) => r.occurrence_date)).toEqual(["2026-08-01"]);
  });

  it("hides private skips from other users", async () => {
    const templateId = await createTemplate();
    const { error } = await ctx.admin.from("recurring_occurrence_skips").insert({
      user_id: ctx.userA.userId,
      recurring_template_id: templateId,
      occurrence_date: "2026-08-01",
      created_by: ctx.userA.userId,
    });
    if (error) throw error;

    const select = await ctx.userB.client
      .from("recurring_occurrence_skips")
      .select("id")
      .eq("recurring_template_id", templateId);
    expect(select.error).toBeNull();
    expect(select.data ?? []).toHaveLength(0);
  });

  it("blocks ownership spoofing and direct mutation", async () => {
    const templateId = await createTemplate();

    const spoof = await ctx.userB.client
      .from("recurring_occurrence_skips")
      .insert({
        user_id: ctx.userA.userId,
        recurring_template_id: templateId,
        occurrence_date: "2026-08-01",
        created_by: ctx.userB.userId,
      })
      .select();
    expectBlockedWrite(spoof);

    const ownerInsert = await ctx.userA.client
      .from("recurring_occurrence_skips")
      .insert({
        user_id: ctx.userA.userId,
        recurring_template_id: templateId,
        occurrence_date: "2026-09-01",
        created_by: ctx.userA.userId,
      })
      .select("id")
      .single();
    expect(ownerInsert.error).toBeNull();

    const update = await ctx.userA.client
      .from("recurring_occurrence_skips")
      .update({ occurrence_date: "2026-10-01" })
      .eq("id", ownerInsert.data!.id)
      .select();
    expectBlockedWrite(update);

    const del = await ctx.userA.client
      .from("recurring_occurrence_skips")
      .delete()
      .eq("id", ownerInsert.data!.id)
      .select();
    expectBlockedWrite(del);
  });

  it("denies anon access", async () => {
    const anon = createAnonClient();
    const select = await anon.from("recurring_occurrence_skips").select("id").limit(1);
    // The table grants no privileges to anon (Supabase Data API rollout), so CI/cloud
    // returns a hard table-level denial (data null); local stacks that still default-grant
    // anon instead let RLS hide rows to an empty set. Either way anon must read nothing.
    expect(select.data ?? []).toHaveLength(0);

    const insert = await anon.from("recurring_occurrence_skips").insert({
      user_id: "00000000-0000-4000-8000-000000000001",
      recurring_template_id: "00000000-0000-4000-8000-000000000002",
      occurrence_date: "2026-08-01",
      created_by: "00000000-0000-4000-8000-000000000001",
    });
    expect(insert.error).not.toBeNull();
  });
});
