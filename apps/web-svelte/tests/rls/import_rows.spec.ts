import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: transaction_import_rows", () => {
  let ctx: TestContext;
  let sessionAId: string;
  let rowAId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "ing", label: `${SENTINEL} ing A` })
      .select("id")
      .single();
    if (acct.error) throw acct.error;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: acct.data.id,
        source_file_hash: `hash-${SENTINEL}`,
        detected_kind: "ing",
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;
    sessionAId = sess.data.id;

    const row = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: sessionAId,
        row_index: 0,
        posted_at: "2026-01-15",
        amount: 42.30,
        type: "expense",
        description: `${SENTINEL} BIEDRONKA`,
        currency: "PLN",
        raw_row_hash: `rowhash-${SENTINEL}`,
      })
      .select("id")
      .single();
    if (row.error) throw row.error;
    rowAId = row.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads rows of own session", async () => {
    const { data, error } = await ctx.userA.client
      .from("transaction_import_rows")
      .select("id")
      .eq("session_id", sessionAId);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("user B does NOT see rows from user A's session", async () => {
    const { data } = await ctx.userB.client
      .from("transaction_import_rows")
      .select("id")
      .eq("id", rowAId);
    expect(data?.length).toBe(0);
  });

  it("user A can update their own row decision", async () => {
    const result = await ctx.userA.client
      .from("transaction_import_rows")
      .update({ decision: "skip" })
      .eq("id", rowAId)
      .select();
    expect(result.error).toBeNull();
    expect(result.data?.[0]?.decision).toBe("skip");
  });

  it("DELETE not granted to authenticated — row survives the attempt", async () => {
    await ctx.userA.client.from("transaction_import_rows").delete().eq("id", rowAId);
    const after = await ctx.admin
      .from("transaction_import_rows")
      .select("id")
      .eq("id", rowAId);
    expect(after.error).toBeNull();
    expect(after.data?.length).toBe(1);
  });

  it("decision check constraint rejects junk value", async () => {
    const result = await ctx.userA.client
      .from("transaction_import_rows")
      .update({ decision: "bogus" as never })
      .eq("id", rowAId);
    expect(result.error).not.toBeNull();
  });

  it("unique(session_id, row_index) blocks duplicate insert", async () => {
    const dup = await ctx.admin.from("transaction_import_rows").insert({
      session_id: sessionAId,
      row_index: 0,
      posted_at: "2026-01-15",
      amount: 1,
      type: "expense",
      description: "dup",
      currency: "PLN",
      raw_row_hash: `dup-${SENTINEL}`,
    });
    expect(dup.error).not.toBeNull();
  });
});
