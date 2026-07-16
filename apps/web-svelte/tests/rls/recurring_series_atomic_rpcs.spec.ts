import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: recurring series atomic RPCs", () => {
  let ctx: TestContext;
  let groupId: string;
  let categoryAId: string;
  let templateId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} series rpc`,
    });
    if (groupError || !group) throw groupError ?? new Error("create_group failed");
    groupId = (group as { id: string }).id;

    const memberInsert = await ctx.admin.from("group_members").upsert({
      group_id: groupId,
      user_id: ctx.userB.userId,
      role: "member",
    });
    if (memberInsert.error) throw memberInsert.error;

    const catA = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} series rpc cat`, type: "expense" })
      .select("id")
      .single();
    if (catA.error) throw catA.error;
    categoryAId = catA.data.id;

    const template = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        group_id: groupId,
        category_id: categoryAId,
        description: `${SENTINEL} series template`,
        amount: 120,
        currency: "PLN",
        type: "expense",
        date: "2026-01-10",
        is_recurring: true,
        recurring_day: 10,
        recurrence_frequency: "monthly",
        recurrence_interval: 1,
      })
      .select("id")
      .single();
    if (template.error) throw template.error;
    templateId = template.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("skip_recurring_occurrence is idempotent and deletes the materialized row", async () => {
    const slot = "2026-08-10";
    const inserted = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        group_id: groupId,
        category_id: categoryAId,
        description: `${SENTINEL} skip me`,
        amount: 120,
        currency: "PLN",
        type: "expense",
        date: slot,
        status: "upcoming",
        recurring_template_id: templateId,
        recurring_occurrence_date: slot,
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const occurrenceId = inserted.data!.id as string;

    const first = await ctx.userA.client.rpc("skip_recurring_occurrence", {
      p_template_id: templateId,
      p_occurrence_date: slot,
      p_transaction_id: occurrenceId,
    });
    expect(first.error).toBeNull();

    const second = await ctx.userA.client.rpc("skip_recurring_occurrence", {
      p_template_id: templateId,
      p_occurrence_date: slot,
      p_transaction_id: null,
    });
    expect(second.error).toBeNull();

    const skips = await ctx.admin
      .from("recurring_occurrence_skips")
      .select("id")
      .eq("recurring_template_id", templateId)
      .eq("occurrence_date", slot);
    expect(skips.error).toBeNull();
    expect(skips.data).toHaveLength(1);

    const gone = await ctx.admin.from("transactions").select("id").eq("id", occurrenceId);
    expect(gone.data).toHaveLength(0);
  });

  it("end_recurring_series_from_occurrence deletes upcoming and detaches paid rows", async () => {
    const localTemplate = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        group_id: groupId,
        category_id: categoryAId,
        description: `${SENTINEL} end series template`,
        amount: 50,
        currency: "PLN",
        type: "expense",
        date: "2026-02-01",
        is_recurring: true,
        recurring_day: 1,
        recurrence_frequency: "monthly",
      })
      .select("id")
      .single();
    expect(localTemplate.error).toBeNull();
    const tid = localTemplate.data!.id as string;

    const upcoming = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userA.userId,
      group_id: groupId,
      category_id: categoryAId,
      description: `${SENTINEL} upcoming future`,
      amount: 50,
      currency: "PLN",
      type: "expense",
      date: "2026-09-01",
      status: "upcoming",
      recurring_template_id: tid,
      recurring_occurrence_date: "2026-09-01",
    });
    expect(upcoming.error).toBeNull();

    const paid = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        group_id: groupId,
        category_id: categoryAId,
        description: `${SENTINEL} paid future`,
        amount: 50,
        currency: "PLN",
        type: "expense",
        date: "2026-10-01",
        status: "paid",
        recurring_template_id: tid,
        recurring_occurrence_date: "2026-10-01",
      })
      .select("id")
      .single();
    expect(paid.error).toBeNull();
    const paidId = paid.data!.id as string;

    const end = await ctx.userA.client.rpc("end_recurring_series_from_occurrence", {
      p_template_id: tid,
      p_occurrence_date: "2026-09-01",
    });
    expect(end.error).toBeNull();

    const templateRow = await ctx.admin
      .from("transactions")
      .select("recurrence_end_date")
      .eq("id", tid)
      .single();
    expect(templateRow.data?.recurrence_end_date).toBe("2026-08-31");

    const remaining = await ctx.admin
      .from("transactions")
      .select("id, status, recurring_template_id, recurring_occurrence_date")
      .eq("description", `${SENTINEL} upcoming future`);
    expect(remaining.data).toHaveLength(0);

    const detached = await ctx.admin
      .from("transactions")
      .select("recurring_template_id, recurring_occurrence_date")
      .eq("id", paidId)
      .single();
    expect(detached.data?.recurring_template_id).toBeNull();
    expect(detached.data?.recurring_occurrence_date).toBeNull();
  });

  it("bulk_delete_transactions records skip memory for recurring rows", async () => {
    const slot = "2026-11-10";
    const inserted = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        group_id: groupId,
        category_id: categoryAId,
        description: `${SENTINEL} bulk delete`,
        amount: 120,
        currency: "PLN",
        type: "expense",
        date: slot,
        status: "upcoming",
        recurring_template_id: templateId,
        recurring_occurrence_date: slot,
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const occurrenceId = inserted.data!.id as string;

    const deleted = await ctx.userA.client.rpc("bulk_delete_transactions", {
      p_transaction_ids: [occurrenceId],
    });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBe(1);

    const skip = await ctx.admin
      .from("recurring_occurrence_skips")
      .select("recurring_template_id, occurrence_date")
      .eq("recurring_template_id", templateId)
      .eq("occurrence_date", slot)
      .maybeSingle();
    expect(skip.error).toBeNull();
    expect(skip.data?.recurring_template_id).toBe(templateId);
  });

  it("materialize_recurring_occurrence returns an existing logical slot", async () => {
    const slot = "2026-12-10";
    const first = await ctx.userA.client.rpc("materialize_recurring_occurrence", {
      p_template_id: templateId,
      p_occurrence_date: slot,
    });
    expect(first.error).toBeNull();

    const second = await ctx.userB.client.rpc("materialize_recurring_occurrence", {
      p_template_id: templateId,
      p_occurrence_date: slot,
    });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);
  });
});
