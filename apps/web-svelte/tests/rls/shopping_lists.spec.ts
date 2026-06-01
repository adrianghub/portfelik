import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: shopping_lists", () => {
  let ctx: TestContext;
  let listAId: string;
  let listBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seed = async (userId: string, label: string) => {
      const { data, error } = await ctx.admin
        .from("shopping_lists")
        .insert({ user_id: userId, name: `${SENTINEL} ${label}` })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };

    listAId = await seed(ctx.userA.userId, "listA");
    listBId = await seed(ctx.userB.userId, "listB");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A sees own list", async () => {
    const { data } = await ctx.userA.client.from("shopping_lists").select("id").eq("id", listAId);
    expect(data?.length).toBe(1);
  });

  it("user A does NOT see user B's list (no shared group)", async () => {
    const { data, error } = await ctx.userA.client
      .from("shopping_lists")
      .select("id")
      .eq("id", listBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot update user B's list", async () => {
    const result = await ctx.userA.client
      .from("shopping_lists")
      .update({ name: `${SENTINEL} hacked` })
      .eq("id", listBId)
      .select();
    expectBlockedWrite(result);
  });

  it("owner can update planning mode fields", async () => {
    const result = await ctx.userA.client
      .from("shopping_lists")
      .update({
        planned_for: "2026-05-30",
        shopping_started_at: "2026-05-28T12:00:00Z",
      })
      .eq("id", listAId)
      .select("planned_for, shopping_started_at")
      .single();

    expect(result.error).toBeNull();
    expect(result.data?.planned_for).toBe("2026-05-30");
    expect(result.data?.shopping_started_at).toBe("2026-05-28T12:00:00+00:00");
  });

  it("user A cannot update user B's planning mode fields", async () => {
    const result = await ctx.userA.client
      .from("shopping_lists")
      .update({
        planned_for: "2026-06-01",
        shopping_started_at: "2026-05-28T13:00:00Z",
      })
      .eq("id", listBId)
      .select("planned_for, shopping_started_at");

    expectBlockedWrite(result);
  });

  it("user A cannot insert list with user_id = B", async () => {
    const result = await ctx.userA.client.from("shopping_lists").insert({
      user_id: ctx.userB.userId,
      name: `${SENTINEL} spoofed`,
    });
    expect(result.error).not.toBeNull();
  });

  it("client cannot mutate user_id on an existing list", async () => {
    const result = await ctx.userA.client
      .from("shopping_lists")
      .update({ user_id: ctx.userB.userId } as never)
      .eq("id", listAId)
      .select("user_id");
    expectBlockedWrite(result);

    const after = await ctx.admin
      .from("shopping_lists")
      .select("user_id")
      .eq("id", listAId)
      .single();
    expect(after.data?.user_id).toBe(ctx.userA.userId);
  });

  describe("group-shared lists + attach hardening", () => {
    let groupAId: string;
    let groupBId: string;
    let sharedListId: string;
    let txInGroupAId: string;
    let txPrivateId: string;
    let categoryId: string;

    beforeAll(async () => {
      // groupA: A owner + B member. groupB: A owner, B not a member.
      const { data: gA, error: gAErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} groupA`,
      });
      if (gAErr || !gA) throw gAErr ?? new Error("no groupA");
      groupAId = (gA as { id: string }).id;
      const memberA = await ctx.admin
        .from("group_members")
        .insert({ group_id: groupAId, user_id: ctx.userB.userId });
      if (memberA.error) throw memberA.error;

      const { data: gB, error: gBErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} groupB`,
      });
      if (gBErr || !gB) throw gBErr ?? new Error("no groupB");
      groupBId = (gB as { id: string }).id;

      // Seed a category owned by A so transactions can FK to it.
      const cat = await ctx.admin
        .from("categories")
        .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} cat`, type: "expense" })
        .select("id")
        .single();
      if (cat.error) throw cat.error;
      categoryId = cat.data.id;

      // Shared list in groupA, with one item so complete/attach can pass empty-guard.
      const shared = await ctx.admin
        .from("shopping_lists")
        .insert({
          user_id: ctx.userA.userId,
          name: `${SENTINEL} sharedListA`,
          group_id: groupAId,
        })
        .select("id")
        .single();
      if (shared.error) throw shared.error;
      sharedListId = shared.data.id;

      await ctx.admin.from("shopping_list_items").insert({
        shopping_list_id: sharedListId,
        name: `${SENTINEL} item`,
        position: 1,
      });

      // Two txs owned by A: one in groupA, one private.
      const txGroup = await ctx.admin
        .from("transactions")
        .insert({
          user_id: ctx.userA.userId,
          category_id: categoryId,
          description: `${SENTINEL} tx-groupA`,
          amount: 10,
          type: "expense",
          date: "2026-05-15",
          group_id: groupAId,
        })
        .select("id")
        .single();
      if (txGroup.error) throw txGroup.error;
      txInGroupAId = txGroup.data.id;

      const txPriv = await ctx.admin
        .from("transactions")
        .insert({
          user_id: ctx.userA.userId,
          category_id: categoryId,
          description: `${SENTINEL} tx-private`,
          amount: 20,
          type: "expense",
          date: "2026-05-15",
        })
        .select("id")
        .single();
      if (txPriv.error) throw txPriv.error;
      txPrivateId = txPriv.data.id;
    });

    it("INSERT: user B cannot create a list in groupB (not a member)", async () => {
      const result = await ctx.userB.client.from("shopping_lists").insert({
        user_id: ctx.userB.userId,
        name: `${SENTINEL} unauthorized-group`,
        group_id: groupBId,
      });
      expect(result.error).not.toBeNull();
    });

    it("INSERT: user B CAN create a list in groupA (is a member)", async () => {
      const result = await ctx.userB.client
        .from("shopping_lists")
        .insert({
          user_id: ctx.userB.userId,
          name: `${SENTINEL} member-groupA`,
          group_id: groupAId,
        })
        .select("id");
      expect(result.error).toBeNull();
    });

    it("UPDATE: non-owner group member CANNOT change list.group_id", async () => {
      // user B is member of groupA via shared list, tries to move it to groupB.
      const result = await ctx.userB.client
        .from("shopping_lists")
        .update({ group_id: groupBId })
        .eq("id", sharedListId)
        .select();
      expect(result.error).not.toBeNull();
    });

    it("UPDATE: non-owner can still edit other fields on a shared list", async () => {
      const result = await ctx.userB.client
        .from("shopping_lists")
        .update({ name: `${SENTINEL} renamed-by-member` })
        .eq("id", sharedListId)
        .select();
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.name).toBe(`${SENTINEL} renamed-by-member`);
    });

    it("ATTACH: rejects when list and tx are on different sharing scopes (private/group)", async () => {
      // sharedListId is in groupA; txPrivateId is private.
      const result = await ctx.userA.client.rpc("attach_shopping_list_to_transaction", {
        p_list_id: sharedListId,
        p_tx_id: txPrivateId,
      });
      expect(result.error).not.toBeNull();
      expect(result.error?.message ?? "").toMatch(/sharing_scope_mismatch/);
    });

    it("ATTACH: accepts when list and tx are in the same group", async () => {
      const result = await ctx.userA.client.rpc("attach_shopping_list_to_transaction", {
        p_list_id: sharedListId,
        p_tx_id: txInGroupAId,
      });
      expect(result.error).toBeNull();
    });

    it("ATTACH: rejects when transaction is income", async () => {
      // Seed a private income tx and a fresh private list with one item - both
      // owned by A so the sharing-scope check passes and the type guard fires.
      const incomeTx = await ctx.admin
        .from("transactions")
        .insert({
          user_id: ctx.userA.userId,
          category_id: categoryId,
          description: `${SENTINEL} tx-income`,
          amount: 500,
          type: "income",
          date: "2026-05-22",
        })
        .select("id")
        .single();
      if (incomeTx.error) throw incomeTx.error;

      const list = await ctx.admin
        .from("shopping_lists")
        .insert({
          user_id: ctx.userA.userId,
          name: `${SENTINEL} list-for-income-guard`,
        })
        .select("id")
        .single();
      if (list.error) throw list.error;

      const item = await ctx.admin.from("shopping_list_items").insert({
        shopping_list_id: list.data.id,
        name: `${SENTINEL} item`,
        position: 1,
      });
      if (item.error) throw item.error;

      const result = await ctx.userA.client.rpc("attach_shopping_list_to_transaction", {
        p_list_id: list.data.id,
        p_tx_id: incomeTx.data.id,
      });
      expect(result.error).not.toBeNull();
      expect(result.error?.message ?? "").toMatch(/transaction_not_expense/);
    });

    it("COMPLETE: rejects an empty list", async () => {
      // Create a fresh empty list and try to complete it.
      const empty = await ctx.admin
        .from("shopping_lists")
        .insert({
          user_id: ctx.userA.userId,
          name: `${SENTINEL} empty-list`,
        })
        .select("id")
        .single();
      if (empty.error) throw empty.error;

      const result = await ctx.userA.client.rpc("complete_shopping_list", {
        p_list_id: empty.data.id,
        p_total_amount: 5,
        p_category_id: categoryId,
      });
      expect(result.error).not.toBeNull();
      expect(result.error?.message ?? "").toMatch(/list_empty/);
    });
  });
});
