import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupSentinels, expectBlockedWrite, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: push_subscriptions", () => {
  let ctx: TestContext;
  const endpointA = "https://rls.test/push/A";
  const endpointB = "https://rls.test/push/B";

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    // wipe any leftover rows on these endpoints
    await ctx.admin.from("push_subscriptions").delete().in("endpoint", [endpointA, endpointB]);

    const seed = async (userId: string, endpoint: string) => {
      const { error } = await ctx.admin.from("push_subscriptions").insert({
        user_id: userId,
        endpoint,
        p256dh: "x",
        auth: "y",
      });
      if (error) throw error;
    };
    await seed(ctx.userA.userId, endpointA);
    await seed(ctx.userB.userId, endpointB);
  });

  afterAll(async () => {
    await ctx.admin.from("push_subscriptions").delete().in("endpoint", [endpointA, endpointB]);
  });

  it("user A reads own subscription", async () => {
    const { data } = await ctx.userA.client
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", endpointA);
    expect(data?.length).toBe(1);
  });

  it("user A cannot read user B's subscription", async () => {
    const { data, error } = await ctx.userA.client
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", endpointB);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot insert subscription with user_id = B", async () => {
    const result = await ctx.userA.client.from("push_subscriptions").insert({
      user_id: ctx.userB.userId,
      endpoint: "https://rls.test/push/spoof",
      p256dh: "x",
      auth: "y",
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot delete user B's subscription", async () => {
    const result = await ctx.userA.client
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpointB)
      .select();
    expectBlockedWrite(result);
  });

  it("fetch_admin_push_subscriptions denies non-admin", async () => {
    const { error } = await ctx.userA.client.rpc("fetch_admin_push_subscriptions");
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "")).toMatch(/permission_denied/);
  });

  it("delete_admin_push_subscription denies non-admin", async () => {
    const { error } = await ctx.userA.client.rpc("delete_admin_push_subscription", {
      p_endpoint: endpointB,
    });
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "")).toMatch(/permission_denied/);
  });
});
