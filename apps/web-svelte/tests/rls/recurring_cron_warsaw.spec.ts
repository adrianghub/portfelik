import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAdminClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: recurring cron Warsaw date + isolation", () => {
  let ctx: TestContext;
  let categoryId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const cat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} cron cat`, type: "expense" })
      .select("id")
      .single();
    if (cat.error) throw cat.error;
    categoryId = cat.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("product_local_date returns a Europe/Warsaw calendar date", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("product_local_date", {
      p_at: "2026-07-15T22:30:00+00:00",
    });
    expect(error).toBeNull();
    // 22:30 UTC in July = 00:30 Warsaw next day
    expect(data).toBe("2026-07-16");
  });

  it("process_recurring_transactions materializes a due template on product_local_date", async () => {
    const admin = createAdminClient();
    const { data: today, error: todayErr } = await admin.rpc("product_local_date");
    expect(todayErr).toBeNull();
    const dueDate = String(today).slice(0, 10);
    const dueDay = Number(dueDate.slice(8, 10));
    const priorYear = `${Number(dueDate.slice(0, 4)) - 1}${dueDate.slice(4)}`;

    const template = await ctx.userA.client
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        category_id: categoryId,
        description: `${SENTINEL} cron healthy template`,
        amount: 44,
        currency: "PLN",
        type: "expense",
        date: priorYear,
        is_recurring: true,
        recurring_day: dueDay,
        recurrence_frequency: "monthly",
        recurrence_interval: 1,
      })
      .select("id")
      .single();
    expect(template.error).toBeNull();
    const templateId = template.data!.id as string;

    const run = await admin.rpc("process_recurring_transactions");
    expect(run.error).toBeNull();

    const occurrence = await ctx.admin
      .from("transactions")
      .select("id, status")
      .eq("recurring_template_id", templateId)
      .eq("recurring_occurrence_date", dueDate);
    expect(occurrence.error).toBeNull();
    expect((occurrence.data ?? []).length).toBeGreaterThanOrEqual(1);
    expect(occurrence.data?.[0]?.status).toBe("upcoming");
  });
});
