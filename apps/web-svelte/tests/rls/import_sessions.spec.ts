import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: transaction_import_sessions", () => {
  let ctx: TestContext;
  let accountAId: string;
  let sessionAId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "ing", label: `${SENTINEL} ing A` })
      .select("id")
      .single();
    if (acct.error) throw acct.error;
    accountAId = acct.data.id;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: accountAId,
        source_filename: `${SENTINEL}-jan.csv`,
        source_file_hash: `hash-${SENTINEL}-jan`,
        detected_kind: "ing",
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;
    sessionAId = sess.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own session", async () => {
    const { data, error } = await ctx.userA.client
      .from("transaction_import_sessions")
      .select("id")
      .eq("id", sessionAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user B does NOT see user A's session", async () => {
    const { data } = await ctx.userB.client
      .from("transaction_import_sessions")
      .select("id")
      .eq("id", sessionAId);
    expect(data?.length).toBe(0);
  });

  it("client cannot mutate user_id (column-level grant)", async () => {
    await ctx.userA.client
      .from("transaction_import_sessions")
      .update({ user_id: ctx.userB.userId } as never)
      .eq("id", sessionAId);
    const after = await ctx.admin
      .from("transaction_import_sessions")
      .select("user_id")
      .eq("id", sessionAId)
      .single();
    expect(after.data?.user_id).toBe(ctx.userA.userId);
  });

  it("DELETE not granted to authenticated - row survives the attempt", async () => {
    await ctx.userA.client
      .from("transaction_import_sessions")
      .delete()
      .eq("id", sessionAId);
    const after = await ctx.admin
      .from("transaction_import_sessions")
      .select("id")
      .eq("id", sessionAId);
    expect(after.error).toBeNull();
    expect(after.data?.length).toBe(1);
  });

  it("same file → unique while active", async () => {
    const dup = await ctx.userA.client.from("transaction_import_sessions").insert({
      user_id: ctx.userA.userId,
      bank_account_id: accountAId,
      source_filename: `${SENTINEL}-jan.csv`,
      source_file_hash: `hash-${SENTINEL}-jan`,
      detected_kind: "ing",
    });
    expect(dup.error).not.toBeNull();
  });

  it("cancelled sessions don't block re-uploading the same file", async () => {
    await ctx.admin
      .from("transaction_import_sessions")
      .update({ status: "cancelled" })
      .eq("id", sessionAId);

    const fresh = await ctx.userA.client
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: accountAId,
        source_filename: `${SENTINEL}-jan.csv`,
        source_file_hash: `hash-${SENTINEL}-jan`,
        detected_kind: "ing",
      })
      .select("id");
    expect(fresh.error).toBeNull();
    expect(fresh.data?.length).toBe(1);
  });
});
