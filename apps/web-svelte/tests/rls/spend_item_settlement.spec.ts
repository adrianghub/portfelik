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
      expect(unpaidLink.error).toBeNull();

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

  async function privateLine(name: string) {
    const plan = await ctx.admin
      .from("plans")
      .insert({
        name: `${SENTINEL} ${name}`,
        user_id: ctx.userA.userId,
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
        label: name,
        amount: 4000,
        due_date: "2026-10-22",
        status: "confirmed",
      })
      .select("id")
      .single();
    if (item.error) throw item.error;
    return { planId: plan.data.id as string, itemId: item.data.id as string };
  }

  it("keeps a single link when the same transaction is assigned to two plans at once", async () => {
    const malta = await privateLine("Malta");
    const gozo = await privateLine("Gozo");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const txId = await expense({
        userId: ctx.userA.userId,
        categoryId: categoryA,
        description: `Równoległa zaliczka ${attempt}`,
        amount: 1000,
      });
      const [first, second] = await Promise.all([
        ctx.userA.client.rpc("link_plan_transaction", {
          p_plan_id: malta.planId,
          p_transaction_id: txId,
          p_plan_item_id: malta.itemId,
        }),
        ctx.userA.client.rpc("link_plan_transaction", {
          p_plan_id: gozo.planId,
          p_transaction_id: txId,
          p_plan_item_id: gozo.itemId,
        }),
      ]);
      const failures = [first, second].filter((result) => result.error);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.error?.message ?? "").toMatch(/transaction_already_linked/);
      expect(failures[0]?.error?.message ?? "").not.toMatch(/duplicate key/);
      const rows = await ctx.admin
        .from("plan_transaction_links")
        .select("plan_id")
        .eq("transaction_id", txId);
      expect(rows.data).toHaveLength(1);
      const winnerPlanId = first.error ? gozo.planId : malta.planId;
      expect(rows.data?.[0]?.plan_id).toBe(winnerPlanId);
      const removed = await ctx.userA.client.rpc("unlink_plan_transaction", {
        p_plan_id: winnerPlanId,
        p_transaction_id: txId,
      });
      expect(removed.error).toBeNull();
    }
  });

  it("keeps the deposit after the line is cancelled and still allows unlink", async () => {
    const { planId, itemId } = await privateLine("Anulowany apartament");
    const txId = await expense({
      userId: ctx.userA.userId,
      categoryId: categoryA,
      description: "Zaliczka przed anulowaniem",
      amount: 1000,
    });
    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
      p_plan_item_id: itemId,
    });
    expect(linked.error).toBeNull();

    const unpaid = await ctx.admin
      .from("transactions")
      .update({ status: "upcoming" })
      .eq("id", txId)
      .select("id")
      .single();
    expect(unpaid.error).toBeNull();
    const notCounted = await ctx.userA.client.rpc("list_spend_item_settlements", {
      p_plan_id: planId,
    });
    expect(notCounted.data).toEqual([
      expect.objectContaining({ transaction_id: txId, amount: 1000, counts_as_paid: false }),
    ]);
    const paidAgain = await ctx.admin
      .from("transactions")
      .update({ status: "paid" })
      .eq("id", txId);
    expect(paidAgain.error).toBeNull();

    const cancelled = await ctx.userA.client
      .from("plan_items")
      .update({ status: "cancelled" })
      .eq("id", itemId)
      .select("status")
      .single();
    expect(cancelled.error).toBeNull();
    expect(cancelled.data?.status).toBe("cancelled");

    const transaction = await ctx.userA.client
      .from("transactions")
      .select("id, amount, description")
      .eq("id", txId)
      .single();
    expect(transaction.data).toMatchObject({ id: txId, amount: 1000 });

    const listed = await ctx.userA.client.rpc("list_spend_item_settlements", {
      p_plan_id: planId,
    });
    expect(listed.data).toEqual([
      expect.objectContaining({
        plan_item_id: itemId,
        transaction_id: txId,
        amount: 1000,
        counts_as_paid: true,
      }),
    ]);

    const unlinked = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlinked.error).toBeNull();
    const after = await ctx.userA.client.rpc("list_spend_item_settlements", {
      p_plan_id: planId,
    });
    expect(after.data).toEqual([]);
    const surviving = await ctx.userA.client
      .from("transactions")
      .select("id")
      .eq("id", txId)
      .single();
    expect(surviving.data?.id).toBe(txId);

    const rejected = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
      p_plan_item_id: itemId,
    });
    expect(rejected.error?.message ?? "").toMatch(/plan_item_cancelled/);
  });

  it("links a paid expense at plan level without creating an item first", async () => {
    const plan = await ctx.admin
      .from("plans")
      .insert({
        name: `${SENTINEL} Malta no items`,
        user_id: ctx.userA.userId,
        kind: "spend",
        budget_amount: 12000,
        start_date: "2026-10-25",
        end_date: "2026-11-07",
        status: "active",
      })
      .select("id")
      .single();
    if (plan.error) throw plan.error;
    const planId = plan.data.id as string;

    const deposit = await expense({
      userId: ctx.userA.userId,
      categoryId: categoryA,
      description: "Zaliczka bez pozycji",
      amount: 800,
      date: "2026-02-15",
    });

    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: deposit,
      p_plan_item_id: null,
    });
    expect(linked.error).toBeNull();

    const listed = await ctx.userA.client.rpc("list_spend_item_settlements", {
      p_plan_id: planId,
    });
    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([
      expect.objectContaining({
        plan_item_id: null,
        transaction_id: deposit,
        amount: 800,
        counts_as_paid: true,
      }),
    ]);

    const unlinked = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: deposit,
    });
    expect(unlinked.error).toBeNull();
    const surviving = await ctx.userA.client
      .from("transactions")
      .select("id")
      .eq("id", deposit)
      .single();
    expect(surviving.data?.id).toBe(deposit);
  });
  it.each(["upcoming", "overdue"])(
    "links %s at plan and item level without counting it as paid",
    async (status) => {
      const { planId, itemId } = await privateLine(`Planned ${status}`);
      for (const planItemId of [null, itemId]) {
        const txId = await expense({
          userId: ctx.userA.userId,
          categoryId: categoryA,
          description: status,
          amount: 600,
          status,
        });
        const linked = await ctx.userA.client.rpc("link_plan_transaction", {
          p_plan_id: planId,
          p_transaction_id: txId,
          p_plan_item_id: planItemId,
        });
        expect(linked.error).toBeNull();
      }
      const listed = await ctx.userA.client.rpc("list_spend_item_settlements", {
        p_plan_id: planId,
      });
      expect(listed.error).toBeNull();
      expect(listed.data).toHaveLength(2);
      expect(listed.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ plan_item_id: null, counts_as_paid: false, amount: 600 }),
          expect.objectContaining({ plan_item_id: itemId, counts_as_paid: false, amount: 600 }),
        ])
      );
    }
  );

  it("creates upcoming expenses atomically and rolls back a rejected draft", async () => {
    const { planId } = await privateLine("Atomic upcoming");
    const params = {
      p_plan_id: planId,
      p_amount: 725,
      p_description: `${SENTINEL} Atomic upcoming`,
      p_date: "2026-02-15",
      p_category_id: categoryA,
      p_status: "upcoming",
    };
    const created = await ctx.userA.client.rpc("create_and_link_plan_transaction", params);
    expect(created.error).toBeNull();
    const txId = created.data as string;
    const tx = await ctx.userA.client
      .from("transactions")
      .select("status, amount")
      .eq("id", txId)
      .single();
    expect(tx.data).toMatchObject({ status: "upcoming", amount: 725 });
    const listed = await ctx.userA.client.rpc("list_spend_item_settlements", { p_plan_id: planId });
    expect(listed.data).toEqual([
      expect.objectContaining({ transaction_id: txId, counts_as_paid: false, plan_item_id: null }),
    ]);
    const failedDescription = `${SENTINEL} Atomic draft rolled back`;
    const failed = await ctx.userA.client.rpc("create_and_link_plan_transaction", {
      ...params,
      p_description: failedDescription,
      p_status: "draft",
    });
    expect(failed.error?.message ?? "").toMatch(/spend_link_requires_known_status/);
    const rolledBack = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("description", failedDescription);
    expect(rolledBack.error).toBeNull();
    expect(rolledBack.data).toEqual([]);
  });

  it("rejects drafts and updates paid/open facts on subsequent status changes", async () => {
    const { planId } = await privateLine("Draft exclusion");
    const txId = await expense({
      userId: ctx.userA.userId,
      categoryId: categoryA,
      description: "Status transitions",
      amount: 400,
      status: "draft",
    });
    const params = { p_plan_id: planId, p_transaction_id: txId };
    const denied = await ctx.userA.client.rpc("link_plan_transaction", params);
    expect(denied.error?.message ?? "").toMatch(/spend_link_requires_known_status/);
    const ready = await ctx.userA.client
      .from("transactions")
      .update({ status: "upcoming" })
      .eq("id", txId);
    expect(ready.error).toBeNull();
    const linked = await ctx.userA.client.rpc("link_plan_transaction", params);
    expect(linked.error).toBeNull();
    for (const status of ["paid", "overdue", "draft", "upcoming"]) {
      const changed = await ctx.userA.client.from("transactions").update({ status }).eq("id", txId);
      expect(changed.error).toBeNull();
      const listed = await ctx.userA.client.rpc("list_spend_item_settlements", {
        p_plan_id: planId,
      });
      expect(listed.error).toBeNull();
      expect(listed.data).toEqual(
        status === "draft"
          ? []
          : [expect.objectContaining({ transaction_id: txId, counts_as_paid: status === "paid" })]
      );
    }
  });

  it("allows changing a linked private upcoming date outside a shared spend period without exposing it", async () => {
    const { groupId, planId } = await sharedPlan();
    try {
      const txId = await expense({
        userId: ctx.userA.userId,
        categoryId: categoryA,
        description: "Private trip payment",
        amount: 350,
        status: "upcoming",
      });
      const linked = await ctx.userA.client.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: txId,
      });
      expect(linked.error).toBeNull();
      const moved = await ctx.userA.client
        .from("transactions")
        .update({ date: "2026-03-01" })
        .eq("id", txId)
        .select("id")
        .single();
      expect(moved.error).toBeNull();
      expect(moved.data?.id).toBe(txId);
      const stranger = await ctx.userB.client
        .from("transactions")
        .update({ date: "2026-03-02" })
        .eq("id", txId)
        .select("id");
      expect(stranger.data ?? []).toEqual([]);
      const listed = await ctx.userB.client.rpc("list_spend_item_settlements", {
        p_plan_id: planId,
      });
      expect(listed.data).toEqual([
        expect.objectContaining({ transaction_id: txId, description: null, counts_as_paid: false }),
      ]);
    } finally {
      await ctx.admin.from("user_groups").delete().eq("id", groupId);
    }
  });
});
