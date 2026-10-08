import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RPC: spend item settlement", () => {
  let ctx: TestContext;
  let categoryA: string;
  let categoryB: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    categoryA = await categoryFor(ctx.userA.userId, "RLS spend settlement A");
    categoryB = await categoryFor(ctx.userB.userId, "RLS spend settlement B");
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  async function categoryFor(userId: string, name: string): Promise<string> {
    const existing = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .eq("type", "expense")
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;
    const created = await ctx.admin
      .from("categories")
      .insert({ user_id: userId, name, type: "expense" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id;
  }

  async function sharedPlan() {
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} spend-settlement`,
    });
    if (group.error || !group.data) throw group.error ?? new Error("no group");
    const groupId = (group.data as { id: string }).id;
    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    if (member.error) throw member.error;

    const plan = await ctx.admin
      .from("plans")
      .insert({
        name: `${SENTINEL} Malta`,
        user_id: ctx.userA.userId,
        group_id: groupId,
        kind: "spend",
        budget_amount: 12000,
        start_date: "2026-10-25",
        end_date: "2026-11-07",
        status: "active",
      })
      .select("id")
      .single();
    if (plan.error) throw plan.error;

    const item = await ctx.admin
      .from("plan_items")
      .insert({
        plan_id: plan.data.id,
        label: "Apartament",
        amount: 4000,
        due_date: "2026-10-22",
        status: "confirmed",
      })
      .select("id")
      .single();
    if (item.error) throw item.error;
    return { groupId, planId: plan.data.id as string, itemId: item.data.id as string };
  }

  async function expense(opts: {
    userId: string;
    categoryId: string;
    description: string;
    amount: number;
    date?: string;
    groupId?: string | null;
    status?: string;
  }) {
    const created = await ctx.admin
      .from("transactions")
      .insert({
        amount: opts.amount,
        currency: "PLN",
        description: `${SENTINEL} ${opts.description}`,
        date: opts.date ?? "2026-02-01",
        type: "expense",
        status: opts.status ?? "paid",
        category_id: opts.categoryId,
        user_id: opts.userId,
        group_id: opts.groupId ?? null,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id as string;
  }

  it("settles a private deposit against a shared apartment without exposing the description", async () => {
    const { groupId, planId, itemId } = await sharedPlan();
    try {
      const deposit = await expense({
        userId: ctx.userA.userId,
        categoryId: categoryA,
        description: "Zaliczka apartament",
        amount: 1000,
        date: "2026-02-01",
      });
      const balance = await expense({
        userId: ctx.userA.userId,
        categoryId: categoryA,
        description: "Reszta apartamentu",
        amount: 2000,
        date: "2026-10-22",
      });

      const first = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: deposit,
        p_plan_item_id: itemId,
      });
      expect(first.error).toBeNull();
      const second = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: balance,
        p_plan_item_id: itemId,
      });
      expect(second.error).toBeNull();

      const duplicate = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: deposit,
        p_plan_item_id: itemId,
      });
      expect(duplicate.error).toBeNull();

      const otherPlan = await ctx.admin
        .from("plans")
        .insert({
          name: `${SENTINEL} inny`,
          user_id: ctx.userA.userId,
          kind: "spend",
          budget_amount: 1000,
          start_date: "2026-10-01",
          end_date: "2026-10-31",
          status: "active",
        })
        .select("id")
        .single();
      if (otherPlan.error) throw otherPlan.error;
      const otherItem = await ctx.admin
        .from("plan_items")
        .insert({
          plan_id: otherPlan.data.id,
          label: "Lot",
          amount: 500,
          due_date: "2026-10-02",
          status: "planned",
        })
        .select("id")
        .single();
      if (otherItem.error) throw otherItem.error;
      const stolen = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: otherPlan.data.id,
        p_transaction_id: deposit,
        p_plan_item_id: otherItem.data.id,
      });
      expect(stolen.error?.message ?? "").toMatch(/transaction_already_linked/);

      const hidden = await ctx.userB.client
        .from("transactions")
        .select("id, description")
        .eq("id", deposit);
      expect(hidden.data ?? []).toEqual([]);
      const hiddenLinks = await ctx.userB.client
        .from("plan_transaction_links")
        .select("id, transaction_id")
        .eq("plan_id", planId);
      expect(hiddenLinks.data ?? []).toEqual([]);

      const forMember = await ctx.userB.client.rpc("list_spend_item_settlements", {
        p_plan_id: planId,
      });
      expect(forMember.error).toBeNull();
      expect(forMember.data).toEqual([
        expect.objectContaining({
          plan_item_id: itemId,
          amount: 1000,
          counts_as_paid: true,
          description: null,
        }),
        expect.objectContaining({
          plan_item_id: itemId,
          amount: 2000,
          description: null,
        }),
      ]);

      const forOwner = await ctx.userA.client.rpc("list_spend_item_settlements", {
        p_plan_id: planId,
      });
      expect(
        forOwner.data?.map((row: { description: string | null }) => row.description).sort()
      ).toEqual([`${SENTINEL} Reszta apartamentu`, `${SENTINEL} Zaliczka apartament`].sort());

      const moved = await ctx.userA.client
        .from("plans")
        .update({ end_date: "2026-12-01" })
        .eq("id", planId)
        .select("end_date")
        .single();
      expect(moved.error).toBeNull();

      const stranger = await expense({
        userId: ctx.userB.userId,
        categoryId: categoryB,
        description: "Cudza zaliczka",
        amount: 50,
      });
      const rejected = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: stranger,
        p_plan_item_id: itemId,
      });
      expect(rejected.error).not.toBeNull();

      const unpaid = await expense({
        userId: ctx.userA.userId,
        categoryId: categoryA,
        description: "Nieopłacone",
        amount: 10,
        status: "upcoming",
      });
      const unpaidLink = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: unpaid,
        p_plan_item_id: itemId,
      });
      expect(unpaidLink.error?.message ?? "").toMatch(/spend_link_requires_paid/);

      const unlinked = await ctx.userA.client.rpc("unlink_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: deposit,
      });
      expect(unlinked.error).toBeNull();
      const again = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: deposit,
        p_plan_item_id: itemId,
      });
      expect(again.error).toBeNull();
    } finally {
      await ctx.admin.from("user_groups").delete().eq("id", groupId);
    }
  });
});
