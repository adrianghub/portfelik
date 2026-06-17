import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: cash_positions", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    // Remove any leftover rows owned by the test users before seeding.
    await ctx.admin
      .from("cash_positions")
      .delete()
      .in("owner_id", [ctx.userA.userId, ctx.userB.userId]);
    // Seed userA's private position via the admin client (bypasses RLS).
    const { error } = await ctx.admin.from("cash_positions").insert({
      owner_id: ctx.userA.userId,
      opening_amount: 1000,
      as_of_date: "2026-06-01",
    });
    if (error) throw error;
  });

  afterAll(async () => {
    await ctx.admin
      .from("cash_positions")
      .delete()
      .in("owner_id", [ctx.userA.userId, ctx.userB.userId]);
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own private position", async () => {
    const { data, error } = await ctx.userA.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("owner_id", ctx.userA.userId)
      .single();
    expect(error).toBeNull();
    expect(Number(data?.opening_amount)).toBe(1000);
  });

  it("user B cannot read user A private position", async () => {
    const { data, error } = await ctx.userB.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("owner_id", ctx.userA.userId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("user B cannot insert a position owned by user A", async () => {
    const result = await ctx.userB.client
      .from("cash_positions")
      .insert({
        owner_id: ctx.userA.userId,
        opening_amount: 5,
        as_of_date: "2026-06-01",
      })
      .select();
    expectBlockedWrite(result);
  });

  it("user A can upsert own private position (app path: onConflict owner_id)", async () => {
    // Mirrors upsertPrivateCashPosition in services/cash-position.ts. Requires a
    // plain (non-partial) unique index on owner_id to be a valid ON CONFLICT arbiter.
    const { error } = await ctx.userA.client
      .from("cash_positions")
      .upsert(
        { owner_id: ctx.userA.userId, opening_amount: 1234, as_of_date: "2026-06-02" },
        { onConflict: "owner_id" },
      );
    expect(error).toBeNull();

    const { data } = await ctx.userA.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("owner_id", ctx.userA.userId)
      .single();
    expect(Number(data?.opening_amount)).toBe(1234);
  });

  it("private scope is immutable on update (cannot attach a group_id)", async () => {
    const result = await ctx.userA.client
      .from("cash_positions")
      .update({ group_id: "00000000-0000-0000-0000-000000000001" })
      .eq("owner_id", ctx.userA.userId)
      .select();
    expectBlockedWrite(result);
  });
});

describe("RLS: cash_positions (group scope)", () => {
  let ctx: TestContext;
  let groupId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    // userA owns a group; userB is a plain member (not co-owner).
    const { data, error } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} cash-pos-group`,
    });
    if (error || !data) throw error ?? new Error("no group");
    groupId = (data as { id: string }).id;
    await ctx.admin
      .from("group_members")
      .upsert({ group_id: groupId, user_id: ctx.userB.userId, role: "member" });

    // Owner (co-owner-equivalent) seeds the group cash position.
    const { error: insErr } = await ctx.userA.client
      .from("cash_positions")
      .insert({ group_id: groupId, opening_amount: 5000, as_of_date: "2026-06-01" });
    if (insErr) throw insErr;
  });

  afterAll(async () => {
    // Deleting the SENTINEL group cascades to its cash_positions (group_id FK ON DELETE CASCADE).
    await cleanupSentinels(ctx.admin);
  });

  it("group owner can write the group position", async () => {
    const { data } = await ctx.userA.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("group_id", groupId)
      .single();
    expect(Number(data?.opening_amount)).toBe(5000);
  });

  it("a plain member can read the group position", async () => {
    const { data, error } = await ctx.userB.client
      .from("cash_positions")
      .select("opening_amount")
      .eq("group_id", groupId)
      .single();
    expect(error).toBeNull();
    expect(Number(data?.opening_amount)).toBe(5000);
  });

  it("a plain member (non-co-owner) cannot update the group position", async () => {
    const result = await ctx.userB.client
      .from("cash_positions")
      .update({ opening_amount: 1 })
      .eq("group_id", groupId)
      .select();
    expectBlockedWrite(result);
  });

  it("a co-owner cannot move the group anchor into their private scope", async () => {
    // The vuln the scope-lock trigger closes: owner/co-owner has UPDATE rights on the
    // group row, and {owner_id = me, group_id = null} is a valid private shape — only an
    // OLD-vs-NEW scope comparison blocks the move.
    const result = await ctx.userA.client
      .from("cash_positions")
      .update({ owner_id: ctx.userA.userId, group_id: null })
      .eq("group_id", groupId)
      .select();
    expectBlockedWrite(result);

    // Group anchor untouched.
    const { data } = await ctx.userA.client
      .from("cash_positions")
      .select("opening_amount, owner_id")
      .eq("group_id", groupId)
      .single();
    expect(Number(data?.opening_amount)).toBe(5000);
    expect(data?.owner_id).toBeNull();
  });
});
