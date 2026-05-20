import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: bank_accounts", () => {
  let ctx: TestContext;
  let accountAId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const seed = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "mbank", label: `${SENTINEL} mbank A` })
      .select("id")
      .single();
    if (seed.error) throw seed.error;
    accountAId = seed.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own account", async () => {
    const { data, error } = await ctx.userA.client
      .from("bank_accounts")
      .select("id")
      .eq("id", accountAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user B does NOT see user A's account", async () => {
    const { data, error } = await ctx.userB.client
      .from("bank_accounts")
      .select("id")
      .eq("id", accountAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot insert with user_id = B (spoofed owner)", async () => {
    const result = await ctx.userA.client.from("bank_accounts").insert({
      user_id: ctx.userB.userId,
      kind: "ing",
      label: `${SENTINEL} spoofed`,
    });
    expect(result.error).not.toBeNull();
  });

  it("client cannot change user_id on an existing row (column-level grant)", async () => {
    const result = await ctx.userA.client
      .from("bank_accounts")
      .update({ user_id: ctx.userB.userId } as never)
      .eq("id", accountAId)
      .select();
    const after = await ctx.admin
      .from("bank_accounts")
      .select("user_id")
      .eq("id", accountAId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.user_id).toBe(ctx.userA.userId);
    void result;
  });

  it("DELETE not granted to authenticated — row survives the attempt", async () => {
    // PostgREST returns 204 (no error, no data) when DELETE privilege is
    // absent, so we verify via the admin client that the row still exists.
    await ctx.userA.client.from("bank_accounts").delete().eq("id", accountAId);
    const after = await ctx.admin
      .from("bank_accounts")
      .select("id")
      .eq("id", accountAId);
    expect(after.error).toBeNull();
    expect(after.data?.length).toBe(1);
  });

  it("soft-archive via archived_at + unique(user_id, kind) is active-only", async () => {
    // Archive the seeded account.
    const archive = await ctx.userA.client
      .from("bank_accounts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", accountAId)
      .select();
    expect(archive.error).toBeNull();
    expect(archive.data?.[0]?.archived_at).toBeTruthy();

    // Insert a fresh active row of the same kind — should succeed since
    // the original is now archived.
    const result = await ctx.userA.client
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "mbank", label: `${SENTINEL} mbank A v2` })
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data?.length).toBe(1);
  });

  it("currency must match ^[A-Z]{3}$ (uppercased)", async () => {
    const result = await ctx.userA.client.from("bank_accounts").insert({
      user_id: ctx.userA.userId,
      kind: "ing",
      label: `${SENTINEL} bad currency`,
      currency: "pln",
    });
    expect(result.error).not.toBeNull();
  });
});
