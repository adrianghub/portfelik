import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  expectEmpty,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: transactions", () => {
  let ctx: TestContext;
  let categoryAId: string;
  let categoryBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    // Seed categories owned by each user (transactions FK requires it).
    const catA = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} catA`, type: "expense" })
      .select("id")
      .single();
    if (catA.error) throw catA.error;
    categoryAId = catA.data.id;

    const catB = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userB.userId, name: `${SENTINEL} catB`, type: "expense" })
      .select("id")
      .single();
    if (catB.error) throw catB.error;
    categoryBId = catB.data.id;

    // Seed one tx per user.
    const txA = await ctx.admin.from("transactions").insert({
      user_id: ctx.userA.userId,
      category_id: categoryAId,
      description: `${SENTINEL} A tx`,
      amount: 10,
      type: "expense",
      date: "2026-05-01",
    });
    if (txA.error) throw txA.error;

    await ctx.admin.from("transactions").insert({
      user_id: ctx.userB.userId,
      category_id: categoryBId,
      description: `${SENTINEL} B tx`,
      amount: 20,
      type: "expense",
      date: "2026-05-01",
    });
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own tx", async () => {
    const { data, error } = await ctx.userA.client
      .from("transactions")
      .select("id, description")
      .like("description", `${SENTINEL}%`);
    expect(error).toBeNull();
    expect(data?.map((t) => t.description)).toEqual([`${SENTINEL} A tx`]);
  });

  it("user A does NOT see user B's tx", async () => {
    const { data, error } = await ctx.userA.client
      .from("transactions")
      .select("id")
      .eq("description", `${SENTINEL} B tx`);
    expectEmpty({ data, error });
  });

  it("user A cannot insert tx with user_id = B", async () => {
    const result = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userB.userId,
      category_id: categoryBId,
      description: `${SENTINEL} spoofed`,
      amount: 1,
      type: "expense",
      date: "2026-05-01",
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot update user B's tx", async () => {
    const result = await ctx.userA.client
      .from("transactions")
      .update({ amount: 999 })
      .eq("description", `${SENTINEL} B tx`)
      .select();
    expectBlockedWrite(result);
  });

  it("user A cannot delete user B's tx", async () => {
    const result = await ctx.userA.client
      .from("transactions")
      .delete()
      .eq("description", `${SENTINEL} B tx`)
      .select();
    expectBlockedWrite(result);
  });

  describe("group-shared visibility (opt-in via tx.group_id)", () => {
    let groupId: string;

    beforeAll(async () => {
      // User A creates group via RPC, then admin client adds B as member.
      const { data: groupData, error: groupErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} group`,
      });
      if (groupErr || !groupData) throw groupErr ?? new Error("no group");
      groupId = (groupData as { id: string }).id;

      const memberInsert = await ctx.admin
        .from("group_members")
        .insert({ group_id: groupId, user_id: ctx.userB.userId });
      if (memberInsert.error) throw memberInsert.error;

      // Assign user B's tx to the group so it becomes visible/writable to user A.
      // Under the new (opt-in) model, group membership alone is NOT enough -
      // tx.group_id must be set explicitly.
      const assign = await ctx.admin
        .from("transactions")
        .update({ group_id: groupId })
        .eq("description", `${SENTINEL} B tx`);
      if (assign.error) throw assign.error;
    });

    it("user A sees user B's tx once it's assigned to the shared group", async () => {
      const { data, error } = await ctx.userA.client
        .from("transactions")
        .select("id, description")
        .like("description", `${SENTINEL}%`);
      expect(error).toBeNull();
      const descs = data?.map((t) => t.description).sort();
      expect(descs).toContain(`${SENTINEL} A tx`);
      expect(descs).toContain(`${SENTINEL} B tx`);
    });

    it("group owner (co-owner) can update user B's shared tx", async () => {
      const result = await ctx.userA.client
        .from("transactions")
        .update({ amount: 555 })
        .eq("description", `${SENTINEL} B tx`)
        .select();
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.amount).toBe(555);
    });

    it("plain group member cannot update peer shared tx", async () => {
      const assignA = await ctx.admin
        .from("transactions")
        .update({ group_id: groupId })
        .eq("description", `${SENTINEL} A tx`);
      if (assignA.error) throw assignA.error;

      const result = await ctx.userB.client
        .from("transactions")
        .update({ amount: 444 })
        .eq("description", `${SENTINEL} A tx`)
        .select();
      expectBlockedWrite(result);
    });

    it("nominated co-owner can update peer shared tx", async () => {
      const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
        p_group_id: groupId,
        p_user_id: ctx.userB.userId,
      });
      expect(nominate.error).toBeNull();

      const assignA = await ctx.admin
        .from("transactions")
        .update({ group_id: groupId })
        .eq("description", `${SENTINEL} A tx`);
      if (assignA.error) throw assignA.error;

      const result = await ctx.userB.client
        .from("transactions")
        .update({ amount: 333 })
        .eq("description", `${SENTINEL} A tx`)
        .select();
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.amount).toBe(333);
    });

    it("user A CANNOT re-own user B's tx (user_id column locked)", async () => {
      // user_id is REVOKE UPDATE - PostgREST drops the column silently and
      // the row stays owned by B. Verify by reading back.
      const update = await ctx.userA.client
        .from("transactions")
        .update({ user_id: ctx.userA.userId } as never)
        .eq("description", `${SENTINEL} B tx`)
        .select();
      // PostgREST may either error or return without changing user_id.
      // Either way the row's owner must NOT flip to A.
      const after = await ctx.admin
        .from("transactions")
        .select("user_id")
        .eq("description", `${SENTINEL} B tx`)
        .single();
      expect(after.error).toBeNull();
      expect(after.data?.user_id).toBe(ctx.userB.userId);
      void update;
    });

    it("user A CANNOT re-share user B's tx into another group (only owner can change group_id)", async () => {
      // Create a second group owned by user A and try to move B's tx into it.
      const { data: otherGroup, error: groupErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} other-group`,
      });
      if (groupErr || !otherGroup) throw groupErr ?? new Error("no other group");
      const otherGroupId = (otherGroup as { id: string }).id;

      const result = await ctx.userA.client
        .from("transactions")
        .update({ group_id: otherGroupId })
        .eq("description", `${SENTINEL} B tx`)
        .select();

      // Trigger raises only_owner_can_change_group_id (P0001) → error.
      expect(result.error).not.toBeNull();

      const after = await ctx.admin
        .from("transactions")
        .select("group_id")
        .eq("description", `${SENTINEL} B tx`)
        .single();
      expect(after.error).toBeNull();
      expect(after.data?.group_id).toBe(groupId);
    });

    it("owner (user B) CAN change group_id of their own tx", async () => {
      // Sanity: trigger only blocks non-owners. The owner is still free
      // to add/remove sharing.
      const result = await ctx.userB.client
        .from("transactions")
        .update({ group_id: null })
        .eq("description", `${SENTINEL} B tx`)
        .select();
      expect(result.error).toBeNull();
      // Put it back for subsequent test isolation.
      await ctx.admin
        .from("transactions")
        .update({ group_id: groupId })
        .eq("description", `${SENTINEL} B tx`);
    });
  });
});
