import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: save_net_worth_snapshot", () => {
  let ctx: TestContext;
  let itemAId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
    await ctx.admin.from("net_worth_items").delete().eq("user_id", ctx.userA.userId);
    await ctx.admin.from("cash_positions").delete().eq("owner_id", ctx.userA.userId);
    await ctx.admin.from("financial_snapshots").delete().eq("user_id", ctx.userA.userId);
    await ctx.admin.from("net_worth_items").delete().eq("user_id", ctx.userB.userId);
    await ctx.admin.from("cash_positions").delete().eq("owner_id", ctx.userB.userId);
    await ctx.admin.from("financial_snapshots").delete().eq("user_id", ctx.userB.userId);

    const seed = await ctx.admin
      .from("net_worth_items")
      .insert({
        user_id: ctx.userA.userId,
        label: `${SENTINEL} seed asset`,
        amount: 1000,
        currency: "PLN",
        position: 0,
      })
      .select("id")
      .single();
    if (seed.error) throw seed.error;
    itemAId = seed.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("saves snapshot, cash anchor, and items atomically", async () => {
    const { data, error } = await ctx.userA.client.rpc("save_net_worth_snapshot", {
      p_as_of_date: "2026-07-01",
      p_opening_amount: 2500,
      p_items: [
        { id: itemAId, label: `${SENTINEL} updated asset`, amount: 1200, currency: "PLN" },
        { label: `${SENTINEL} new asset`, amount: 500, currency: "EUR" },
      ],
    });
    expect(error).toBeNull();
    expect(data?.snapshot?.as_of_date).toBe("2026-07-01");
    expect(Number(data?.cash_position?.opening_amount)).toBe(2500);
    expect(data?.items?.length).toBe(2);

    const snap = await ctx.admin
      .from("financial_snapshots")
      .select("as_of_date")
      .eq("user_id", ctx.userA.userId)
      .single();
    expect(snap.data?.as_of_date).toBe("2026-07-01");

    const cash = await ctx.admin
      .from("cash_positions")
      .select("opening_amount, as_of_date")
      .eq("owner_id", ctx.userA.userId)
      .single();
    expect(Number(cash.data?.opening_amount)).toBe(2500);
    expect(cash.data?.as_of_date).toBe("2026-07-01");

    const items = await ctx.admin
      .from("net_worth_items")
      .select("label, amount, currency")
      .eq("user_id", ctx.userA.userId)
      .order("position", { ascending: true });
    expect(items.data?.length).toBe(2);
    expect(items.data?.[0]?.label).toContain("updated asset");
    expect(items.data?.[1]?.currency).toBe("EUR");
  });

  it("deletes orphan items only after a successful save", async () => {
    const extra = await ctx.admin
      .from("net_worth_items")
      .insert({
        user_id: ctx.userA.userId,
        label: `${SENTINEL} orphan`,
        amount: 99,
        currency: "PLN",
        position: 1,
      })
      .select("id")
      .single();
    if (extra.error) throw extra.error;

    const save = await ctx.userA.client.rpc("save_net_worth_snapshot", {
      p_as_of_date: "2026-07-02",
      p_opening_amount: 100,
      p_items: [{ id: itemAId, label: `${SENTINEL} kept only`, amount: 1000, currency: "PLN" }],
    });
    expect(save.error).toBeNull();

    const remaining = await ctx.admin
      .from("net_worth_items")
      .select("id")
      .eq("user_id", ctx.userA.userId);
    expect(remaining.data?.map((r) => r.id)).toEqual([itemAId]);
  });

  it("rejects another user's item id without mutating state", async () => {
    const itemB = await ctx.admin
      .from("net_worth_items")
      .insert({
        user_id: ctx.userB.userId,
        label: `${SENTINEL} B asset`,
        amount: 300,
        currency: "PLN",
        position: 0,
      })
      .select("id")
      .single();
    if (itemB.error) throw itemB.error;

    const before = await ctx.admin
      .from("net_worth_items")
      .select("label, amount")
      .eq("id", itemAId)
      .single();

    const { error } = await ctx.userA.client.rpc("save_net_worth_snapshot", {
      p_as_of_date: "2026-07-03",
      p_opening_amount: 50,
      p_items: [{ id: itemB.data!.id, label: "stolen", amount: 1, currency: "PLN" }],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/item_not_owned/);

    const snap = await ctx.admin
      .from("financial_snapshots")
      .select("user_id")
      .eq("user_id", ctx.userA.userId)
      .maybeSingle();
    expect(snap.data).toBeNull();

    const after = await ctx.admin
      .from("net_worth_items")
      .select("label, amount")
      .eq("id", itemAId)
      .single();
    expect(after.data).toEqual(before.data);
  });

  it("rolls back when currency is invalid", async () => {
    const { error } = await ctx.userA.client.rpc("save_net_worth_snapshot", {
      p_as_of_date: "2026-07-04",
      p_opening_amount: 10,
      p_items: [{ label: `${SENTINEL} bad fx`, amount: 1, currency: "XXX" }],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/invalid_currency/);

    const snap = await ctx.admin
      .from("financial_snapshots")
      .select("user_id")
      .eq("user_id", ctx.userA.userId)
      .maybeSingle();
    expect(snap.data).toBeNull();
  });

  it("denies anon save_net_worth_snapshot", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("save_net_worth_snapshot", {
      p_as_of_date: "2026-07-05",
      p_opening_amount: 0,
      p_items: [],
    });
    expect(error).not.toBeNull();
  });
});
