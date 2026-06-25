import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupSentinels, expectBlockedWrite, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: action_dismissals", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    await ctx.admin
      .from("action_dismissals")
      .delete()
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);

    const { error: insertA } = await ctx.admin.from("action_dismissals").insert({
      user_id: ctx.userA.userId,
      action_key: "overdue",
    });
    if (insertA) throw insertA;

    const { error: insertB } = await ctx.admin.from("action_dismissals").insert({
      user_id: ctx.userB.userId,
      action_key: "stale_import",
    });
    if (insertB) throw insertB;
  });

  afterAll(async () => {
    await ctx.admin
      .from("action_dismissals")
      .delete()
      .in("user_id", [ctx.userA.userId, ctx.userB.userId]);
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own dismissals", async () => {
    const { data, error } = await ctx.userA.client
      .from("action_dismissals")
      .select("action_key")
      .eq("user_id", ctx.userA.userId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].action_key).toBe("overdue");
  });

  it("user A cannot read user B dismissals", async () => {
    const { data, error } = await ctx.userA.client
      .from("action_dismissals")
      .select("action_key")
      .eq("user_id", ctx.userB.userId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("user A cannot insert a dismissal owned by user B", async () => {
    const result = await ctx.userA.client
      .from("action_dismissals")
      .insert({ user_id: ctx.userB.userId, action_key: "hack" })
      .select();
    expectBlockedWrite(result);
  });

  it("user A cannot update user B dismissals", async () => {
    const result = await ctx.userA.client
      .from("action_dismissals")
      .update({ dismissed_until: new Date().toISOString() })
      .eq("user_id", ctx.userB.userId)
      .select();
    expectBlockedWrite(result);
  });

  it("user A inserts, snoozes, and deletes own dismissal", async () => {
    const { data, error } = await ctx.userA.client
      .from("action_dismissals")
      .insert({ user_id: ctx.userA.userId, action_key: "settle_ready:p1" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    const snooze = await ctx.userA.client
      .from("action_dismissals")
      .update({ dismissed_until: new Date(Date.now() + 86400000).toISOString() })
      .eq("id", data!.id)
      .select();
    expect(snooze.error).toBeNull();
    expect(snooze.data?.length).toBe(1);

    const del = await ctx.userA.client
      .from("action_dismissals")
      .delete()
      .eq("id", data!.id)
      .select();
    expect(del.error).toBeNull();
    expect(del.data?.length).toBe(1);
  });
});
