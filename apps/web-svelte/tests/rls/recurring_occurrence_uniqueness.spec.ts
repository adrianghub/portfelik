import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: recurring occurrence logical uniqueness", () => {
  let ctx: TestContext;
  let groupId: string;
  let categoryAId: string;
  let templateId: string;
  const occurrenceDate = "2026-08-15";

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} recurring uniqueness`,
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
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} recurring uniq cat`, type: "expense" })
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
        description: `${SENTINEL} shared recurring template`,
        amount: 99,
        currency: "PLN",
        type: "expense",
        date: "2026-01-15",
        is_recurring: true,
        recurring_day: 15,
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

  it("rejects a second row for the same template slot with a different actor", async () => {
    const first = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userA.userId,
      group_id: groupId,
      category_id: categoryAId,
      description: `${SENTINEL} occurrence A`,
      amount: 99,
      currency: "PLN",
      type: "expense",
      date: occurrenceDate,
      status: "upcoming",
      recurring_template_id: templateId,
      recurring_occurrence_date: occurrenceDate,
    });
    expect(first.error).toBeNull();

    const second = await ctx.userB.client.from("transactions").insert({
      user_id: ctx.userB.userId,
      group_id: groupId,
      category_id: categoryAId,
      description: `${SENTINEL} occurrence B`,
      amount: 99,
      currency: "PLN",
      type: "expense",
      date: occurrenceDate,
      status: "upcoming",
      recurring_template_id: templateId,
      recurring_occurrence_date: occurrenceDate,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe("23505");
  });

  it("lets a second member upsert-ignore into the existing logical slot", async () => {
    const slot = "2026-09-15";

    const first = await ctx.userA.client
      .from("transactions")
      .upsert(
        {
          user_id: ctx.userA.userId,
          group_id: groupId,
          category_id: categoryAId,
          description: `${SENTINEL} upsert A`,
          amount: 99,
          currency: "PLN",
          type: "expense",
          date: slot,
          status: "upcoming",
          recurring_template_id: templateId,
          recurring_occurrence_date: slot,
        },
        { onConflict: "recurring_template_id,recurring_occurrence_date", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    expect(first.error).toBeNull();
    expect(first.data?.id).toBeTruthy();

    const second = await ctx.userB.client
      .from("transactions")
      .upsert(
        {
          user_id: ctx.userB.userId,
          group_id: groupId,
          category_id: categoryAId,
          description: `${SENTINEL} upsert B`,
          amount: 99,
          currency: "PLN",
          type: "expense",
          date: slot,
          status: "upcoming",
          recurring_template_id: templateId,
          recurring_occurrence_date: slot,
        },
        { onConflict: "recurring_template_id,recurring_occurrence_date", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    expect(second.error).toBeNull();
    expect(second.data).toBeNull();

    const rows = await ctx.admin
      .from("transactions")
      .select("id, user_id")
      .eq("recurring_template_id", templateId)
      .eq("recurring_occurrence_date", slot);
    if (rows.error) throw rows.error;
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0]?.user_id).toBe(ctx.userA.userId);
  });
});
