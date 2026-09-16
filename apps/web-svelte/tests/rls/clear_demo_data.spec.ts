import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: clear_demo_data", () => {
  let ctx: TestContext;
  let expenseCatA: string;
  let expenseCatB: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const [catA, catB] = await Promise.all([
      ctx.admin
        .from("categories")
        .insert({
          user_id: ctx.userA.userId,
          name: `${SENTINEL} demo cat A`,
          type: "expense",
        })
        .select("id")
        .single(),
      ctx.admin
        .from("categories")
        .insert({
          user_id: ctx.userB.userId,
          name: `${SENTINEL} demo cat B`,
          type: "expense",
        })
        .select("id")
        .single(),
    ]);
    if (catA.error) throw catA.error;
    if (catB.error) throw catB.error;
    expenseCatA = catA.data.id;
    expenseCatB = catB.data.id;
  });

  beforeEach(async () => {
    await ctx.admin.from("transactions").delete().eq("is_demo", true);
    await ctx.admin.from("plans").delete().eq("is_demo", true);
    await ctx.admin.from("net_worth_items").delete().eq("is_demo", true);

    const [tx, plan, item] = await Promise.all([
      ctx.admin.from("transactions").insert({
        amount: 10,
        currency: "PLN",
        description: "Zakupy na tydzień",
        date: "2026-06-01",
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: true,
      }),
      ctx.admin.from("plans").insert({
        name: "Portugalia bez kredytu",
        user_id: ctx.userA.userId,
        kind: "save",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        target_amount: 100,
        is_demo: true,
      }),
      ctx.admin.from("net_worth_items").insert({
        user_id: ctx.userA.userId,
        label: "Poduszka finansowa",
        amount: 50,
        currency: "PLN",
        position: 0,
        is_demo: true,
      }),
    ]);
    if (tx.error) throw tx.error;
    if (plan.error) throw plan.error;
    if (item.error) throw item.error;
  });

  afterAll(async () => {
    await ctx.admin.from("transactions").delete().eq("is_demo", true);
    await ctx.admin.from("plans").delete().eq("is_demo", true);
    await ctx.admin.from("net_worth_items").delete().eq("is_demo", true);
    await cleanupSentinels(ctx.admin);
  });

  it("clears all tagged showcase rows for the caller in one call", async () => {
    const { data, error } = await ctx.userA.client.rpc("clear_demo_data");
    expect(error).toBeNull();
    expect(Number(data?.deleted)).toBeGreaterThanOrEqual(3);

    const txs = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .eq("is_demo", true);
    expect(txs.data?.length ?? 0).toBe(0);

    const plans = await ctx.admin
      .from("plans")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .eq("is_demo", true);
    expect(plans.data?.length ?? 0).toBe(0);

    const items = await ctx.admin
      .from("net_worth_items")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .eq("is_demo", true);
    expect(items.data?.length ?? 0).toBe(0);
  });

  it("does not clear another user's showcase rows", async () => {
    const insertB = await ctx.admin
      .from("transactions")
      .insert({
        amount: 20,
        currency: "PLN",
        description: "B only",
        date: "2026-06-02",
        type: "expense",
        status: "paid",
        category_id: expenseCatB,
        user_id: ctx.userB.userId,
        is_demo: true,
      })
      .select("id")
      .single();
    if (insertB.error) throw insertB.error;

    const txId = insertB.data.id;

    try {
      await ctx.userA.client.rpc("clear_demo_data");

      const remaining = await ctx.admin
        .from("transactions")
        .select("id")
        .eq("user_id", ctx.userB.userId)
        .eq("is_demo", true);
      expect(remaining.data?.length).toBe(1);
    } finally {
      await ctx.admin.from("transactions").delete().eq("id", txId);
    }
  });

  it("keeps untagged real rows even when their description starts with Demo:", async () => {
    const [real, prefixed] = await Promise.all([
      ctx.admin
        .from("transactions")
        .insert({
          amount: 20,
          currency: "PLN",
          description: `${SENTINEL} moje dane`,
          date: "2026-06-02",
          type: "expense",
          status: "paid",
          category_id: expenseCatA,
          user_id: ctx.userA.userId,
        })
        .select("id")
        .single(),
      ctx.admin
        .from("transactions")
        .insert({
          amount: 20,
          currency: "PLN",
          description: `Demo: ${SENTINEL} moje dane`,
          date: "2026-06-02",
          type: "expense",
          status: "paid",
          category_id: expenseCatA,
          user_id: ctx.userA.userId,
          is_demo: false,
        })
        .select("id")
        .single(),
    ]);
    if (real.error) throw real.error;
    if (prefixed.error) throw prefixed.error;

    const ids = [real.data.id, prefixed.data.id];
    try {
      const { data, error } = await ctx.userA.client.rpc("clear_demo_data");
      expect(error).toBeNull();
      expect(Number(data?.deleted)).toBe(3);

      const remaining = await ctx.admin.from("transactions").select("id").in("id", ids);
      expect(remaining.error).toBeNull();
      expect(remaining.data?.map((row) => row.id).sort()).toEqual([...ids].sort());
    } finally {
      await ctx.admin.from("transactions").delete().in("id", ids);
    }
  });

  it("denies anon", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("clear_demo_data");
    expect(error).not.toBeNull();
  });

  it("clears untagged occurrences and reminders spawned from a demo template", async () => {
    const template = await ctx.admin
      .from("transactions")
      .insert({
        amount: 980,
        currency: "PLN",
        description: "Czynsz",
        date: "2026-01-15",
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: true,
        is_recurring: true,
        recurring_day: 15,
        recurrence_frequency: "monthly",
        recurrence_interval: 1,
      })
      .select("id")
      .single();
    if (template.error) throw template.error;

    const occurrence = await ctx.admin
      .from("transactions")
      .insert({
        amount: 980,
        currency: "PLN",
        description: "Czynsz",
        date: "2026-09-15",
        type: "expense",
        status: "upcoming",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: false,
        recurring_template_id: template.data.id,
        recurring_occurrence_date: "2026-09-15",
      })
      .select("id")
      .single();
    if (occurrence.error) throw occurrence.error;

    const reminder = await ctx.admin
      .from("notifications")
      .insert({
        user_id: ctx.userA.userId,
        type: "transaction_reminder",
        title: `${SENTINEL} demo reminder`,
        body: "due",
        data: {
          templateId: template.data.id,
          transactionId: occurrence.data.id,
          settleKind: "recurring_occurrence",
        },
      })
      .select("id")
      .single();
    if (reminder.error) throw reminder.error;

    try {
      const { error } = await ctx.userA.client.rpc("clear_demo_data");
      expect(error).toBeNull();

      const leftoverTxs = await ctx.admin
        .from("transactions")
        .select("id")
        .in("id", [template.data.id, occurrence.data.id]);
      expect(leftoverTxs.error).toBeNull();
      expect(leftoverTxs.data ?? []).toEqual([]);

      const leftoverNotes = await ctx.admin
        .from("notifications")
        .select("id")
        .eq("id", reminder.data.id);
      expect(leftoverNotes.error).toBeNull();
      expect(leftoverNotes.data ?? []).toEqual([]);
    } finally {
      await ctx.admin.from("notifications").delete().eq("id", reminder.data.id);
      await ctx.admin
        .from("transactions")
        .delete()
        .in("id", [occurrence.data.id, template.data.id]);
    }
  });

  it("keeps real recurring occurrences whose template is not demo", async () => {
    const template = await ctx.admin
      .from("transactions")
      .insert({
        amount: 40,
        currency: "PLN",
        description: `${SENTINEL} real rent`,
        date: "2026-01-01",
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: false,
        is_recurring: true,
        recurring_day: 1,
        recurrence_frequency: "monthly",
        recurrence_interval: 1,
      })
      .select("id")
      .single();
    if (template.error) throw template.error;

    const occurrence = await ctx.admin
      .from("transactions")
      .insert({
        amount: 40,
        currency: "PLN",
        description: `${SENTINEL} real rent occurrence`,
        date: "2026-09-01",
        type: "expense",
        status: "upcoming",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: false,
        recurring_template_id: template.data.id,
        recurring_occurrence_date: "2026-09-01",
      })
      .select("id")
      .single();
    if (occurrence.error) throw occurrence.error;

    const ids = [template.data.id, occurrence.data.id];
    try {
      const { error } = await ctx.userA.client.rpc("clear_demo_data");
      expect(error).toBeNull();

      const remaining = await ctx.admin.from("transactions").select("id").in("id", ids);
      expect(remaining.error).toBeNull();
      expect(remaining.data?.map((row) => row.id).sort()).toEqual([...ids].sort());
    } finally {
      await ctx.admin.from("transactions").delete().in("id", ids);
    }
  });

  it("tags occurrences of a demo template as is_demo on insert", async () => {
    const template = await ctx.admin
      .from("transactions")
      .insert({
        amount: 120,
        currency: "PLN",
        description: "Muzyka",
        date: "2026-01-10",
        type: "expense",
        status: "paid",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: true,
        is_recurring: true,
        recurring_day: 10,
        recurrence_frequency: "monthly",
        recurrence_interval: 1,
      })
      .select("id")
      .single();
    if (template.error) throw template.error;

    const occurrence = await ctx.admin
      .from("transactions")
      .insert({
        amount: 120,
        currency: "PLN",
        description: "Muzyka",
        date: "2026-09-10",
        type: "expense",
        status: "upcoming",
        category_id: expenseCatA,
        user_id: ctx.userA.userId,
        is_demo: false,
        recurring_template_id: template.data.id,
        recurring_occurrence_date: "2026-09-10",
      })
      .select("id, is_demo")
      .single();
    if (occurrence.error) throw occurrence.error;

    try {
      expect(occurrence.data?.is_demo).toBe(true);
    } finally {
      await ctx.admin
        .from("transactions")
        .delete()
        .in("id", [occurrence.data.id, template.data.id]);
    }
  });

  it("drops an orphaned financial snapshot when no net-worth items remain", async () => {
    const snapshot = await ctx.admin.from("financial_snapshots").upsert({
      user_id: ctx.userA.userId,
      as_of_date: "2026-09-01",
      cash_amount: 0,
      investments_amount: 0,
      real_estate_amount: 24500,
    });
    if (snapshot.error) throw snapshot.error;

    try {
      const { error } = await ctx.userA.client.rpc("clear_demo_data");
      expect(error).toBeNull();

      const leftover = await ctx.admin
        .from("financial_snapshots")
        .select("user_id")
        .eq("user_id", ctx.userA.userId);
      expect(leftover.data ?? []).toEqual([]);
    } finally {
      await ctx.admin.from("financial_snapshots").delete().eq("user_id", ctx.userA.userId);
    }
  });
});
