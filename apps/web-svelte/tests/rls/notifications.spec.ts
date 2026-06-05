import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createUserClient,
  expectBlockedWrite,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RLS: notifications", () => {
  let ctx: TestContext;
  let notifAId: string;
  let notifBId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seed = async (userId: string, label: string) => {
      const { data, error } = await ctx.admin
        .from("notifications")
        .insert({
          user_id: userId,
          type: "system_notification",
          title: `${SENTINEL} ${label}`,
          body: "x",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };
    notifAId = await seed(ctx.userA.userId, "A");
    notifBId = await seed(ctx.userB.userId, "B");
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own notification", async () => {
    const { data } = await ctx.userA.client.from("notifications").select("id").eq("id", notifAId);
    expect(data?.length).toBe(1);
  });

  it("user A cannot read user B's notification", async () => {
    const { data, error } = await ctx.userA.client
      .from("notifications")
      .select("id")
      .eq("id", notifBId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("direct INSERT is blocked (with check false)", async () => {
    const result = await ctx.userA.client.from("notifications").insert({
      user_id: ctx.userA.userId,
      type: "system_notification",
      title: `${SENTINEL} forbidden`,
      body: "x",
    });
    expect(result.error).not.toBeNull();
  });

  it("user A cannot delete user B's notification", async () => {
    const result = await ctx.userA.client
      .from("notifications")
      .delete()
      .eq("id", notifBId)
      .select();
    expectBlockedWrite(result);
  });

  it("fetch_admin_notifications denies non-admin", async () => {
    const { error } = await ctx.userA.client.rpc("fetch_admin_notifications", { p_limit: 10 });
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "")).toMatch(/permission_denied/);
  });

  it("masks notification title/body and returns user_token", async () => {
    const { data: inserted, error: insertError } = await ctx.admin
      .from("notifications")
      .insert({
        user_id: ctx.userB.userId,
        type: "transaction_summary",
        title: "__SECRET_TITLE__",
        body: "__SECRET_BODY_120PLN__",
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    const insertedId = (inserted as { id: string }).id;
    await ctx.admin.from("profiles").update({ role: "admin" }).eq("id", ctx.userA.userId);
    const asAdmin = createUserClient(ctx.userA.accessToken);
    const { data, error } = await asAdmin.rpc("fetch_admin_notifications", { p_limit: 50 });
    await ctx.admin.from("profiles").update({ role: "user" }).eq("id", ctx.userA.userId);
    // cleanup inserted notification
    await ctx.admin.from("notifications").delete().eq("id", insertedId);
    expect(error).toBeNull();
    const json = JSON.stringify(data);
    expect(json).not.toContain("__SECRET_TITLE__");
    expect(json).not.toContain("__SECRET_BODY_120PLN__");
    const row = (data as Array<Record<string, unknown>>).find((r) => r.id === insertedId);
    expect(row?.title).toBe("[masked]");
    expect(row?.body).toBe("[masked]");
    expect(String(row?.user_token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
