import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: plans", () => {
  let ctx: TestContext;
  let planAId: string;
  let planBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seed = async (userId: string, label: string) => {
      const { data, error } = await ctx.admin
        .from("plans")
        .insert({
          user_id: userId,
          name: `${SENTINEL} ${label}`,
          start_date: "2026-06-01",
          end_date: "2026-06-30",
          budget_amount: 1000,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };

    planAId = await seed(ctx.userA.userId, "planA");
    planBId = await seed(ctx.userB.userId, "planB");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A sees own private plan", async () => {
    const { data, error } = await ctx.userA.client.from("plans").select("id").eq("id", planAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user A does not see user B private plan", async () => {
    const { data, error } = await ctx.userA.client.from("plans").select("id").eq("id", planBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot update user B private plan", async () => {
    const result = await ctx.userA.client
      .from("plans")
      .update({ name: `${SENTINEL} hacked` })
      .eq("id", planBId)
      .select();
    expectBlockedWrite(result);
  });

  it("owner can update period and budget fields", async () => {
    const result = await ctx.userA.client
      .from("plans")
      .update({
        start_date: "2026-07-01",
        end_date: "2026-07-14",
        budget_amount: 3000,
      })
      .eq("id", planAId)
      .select("start_date, end_date, budget_amount")
      .single();

    expect(result.error).toBeNull();
    expect(result.data?.start_date).toBe("2026-07-01");
    expect(result.data?.end_date).toBe("2026-07-14");
    expect(Number(result.data?.budget_amount)).toBe(3000);
  });

  it("rejects invalid date period", async () => {
    const result = await ctx.userA.client.from("plans").insert({
      user_id: ctx.userA.userId,
      name: `${SENTINEL} invalid-period`,
      start_date: "2026-07-14",
      end_date: "2026-07-01",
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot insert plan with user_id = B", async () => {
    const result = await ctx.userA.client.from("plans").insert({
      user_id: ctx.userB.userId,
      name: `${SENTINEL} spoofed`,
      start_date: "2026-06-01",
      end_date: "2026-06-30",
    });
    expect(result.error).not.toBeNull();
  });

  it("client cannot mutate user_id on an existing plan", async () => {
    const result = await ctx.userA.client
      .from("plans")
      .update({ user_id: ctx.userB.userId } as never)
      .eq("id", planAId)
      .select("user_id");
    expectBlockedWrite(result);

    const after = await ctx.admin.from("plans").select("user_id").eq("id", planAId).single();
    expect(after.data?.user_id).toBe(ctx.userA.userId);
  });

  describe("group-shared plans", () => {
    let groupAId: string;
    let groupBId: string;
    let sharedPlanId: string;

    beforeAll(async () => {
      const { data: gA, error: gAErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} groupA`,
      });
      if (gAErr || !gA) throw gAErr ?? new Error("no groupA");
      groupAId = (gA as { id: string }).id;

      const memberA = await ctx.admin.from("group_members").insert({
        group_id: groupAId,
        user_id: ctx.userB.userId,
      });
      if (memberA.error) throw memberA.error;

      const { data: gB, error: gBErr } = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} groupB`,
      });
      if (gBErr || !gB) throw gBErr ?? new Error("no groupB");
      groupBId = (gB as { id: string }).id;

      const shared = await ctx.admin
        .from("plans")
        .insert({
          user_id: ctx.userA.userId,
          name: `${SENTINEL} shared-plan`,
          group_id: groupAId,
          start_date: "2026-06-01",
          end_date: "2026-06-30",
          budget_amount: 2000,
        })
        .select("id")
        .single();
      if (shared.error) throw shared.error;
      sharedPlanId = shared.data.id;
    });

    it("group member can see shared plan", async () => {
      const { data, error } = await ctx.userB.client
        .from("plans")
        .select("id")
        .eq("id", sharedPlanId);
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    });

    it("user B cannot create a plan in a group they do not belong to", async () => {
      const result = await ctx.userB.client.from("plans").insert({
        user_id: ctx.userB.userId,
        name: `${SENTINEL} unauthorized-group`,
        group_id: groupBId,
        start_date: "2026-06-01",
        end_date: "2026-06-30",
      });
      expect(result.error).not.toBeNull();
    });

    it("group member can create a plan in their group", async () => {
      const result = await ctx.userB.client
        .from("plans")
        .insert({
          user_id: ctx.userB.userId,
          name: `${SENTINEL} member-groupA`,
          group_id: groupAId,
          start_date: "2026-06-01",
          end_date: "2026-06-30",
        })
        .select("id");
      expect(result.error).toBeNull();
      expect(result.data?.length).toBe(1);
    });

    it("group member cannot move shared plan to an unrelated group", async () => {
      const result = await ctx.userB.client
        .from("plans")
        .update({ group_id: groupBId })
        .eq("id", sharedPlanId)
        .select();
      expectBlockedWrite(result);
    });

    it("plain group member cannot edit another member shared plan", async () => {
      const result = await ctx.userB.client
        .from("plans")
        .update({ name: `${SENTINEL} renamed-by-member` })
        .eq("id", sharedPlanId)
        .select("name");
      expectBlockedWrite(result);
    });

    it("nominated co-owner can edit shared plan", async () => {
      const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
        p_group_id: groupAId,
        p_user_id: ctx.userB.userId,
      });
      expect(nominate.error).toBeNull();

      const result = await ctx.userB.client
        .from("plans")
        .update({ name: `${SENTINEL} renamed-by-co-owner` })
        .eq("id", sharedPlanId)
        .select("name");
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.name).toBe(`${SENTINEL} renamed-by-co-owner`);
    });
  });
});
