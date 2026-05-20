import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: transaction_import_links", () => {
  let ctx: TestContext;
  let txId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    // Seed a category + tx + provenance chain via service role so the row
    // exists for the policy + privilege checks below.
    const cat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} cat`, type: "expense" })
      .select("id")
      .single();
    if (cat.error) throw cat.error;

    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "ing", label: `${SENTINEL} ing` })
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

    const row = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: sess.data.id,
        row_index: 0,
        posted_at: "2026-01-15",
        amount: 10,
        type: "expense",
        description: `${SENTINEL} ROW`,
        currency: "PLN",
        raw_row_hash: `rh-${SENTINEL}`,
      })
      .select("id")
      .single();
    if (row.error) throw row.error;

    const tx = await ctx.admin
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        category_id: cat.data.id,
        description: `${SENTINEL} TX`,
        amount: 10,
        type: "expense",
        date: "2026-01-15",
      })
      .select("id")
      .single();
    if (tx.error) throw tx.error;
    txId = tx.data.id;

    const link = await ctx.admin.from("transaction_import_links").insert({
      transaction_id: txId,
      user_id: ctx.userA.userId,
      bank_account_id: acct.data.id,
      session_id: sess.data.id,
      row_id: row.data.id,
      source_file_hash: `hash-${SENTINEL}`,
      source_row_index: 0,
      fingerprint: `fp-${SENTINEL}`,
    });
    if (link.error) throw link.error;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("user A reads own link", async () => {
    const { data, error } = await ctx.userA.client
      .from("transaction_import_links")
      .select("transaction_id")
      .eq("transaction_id", txId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user B does NOT see user A's link", async () => {
    const { data } = await ctx.userB.client
      .from("transaction_import_links")
      .select("transaction_id")
      .eq("transaction_id", txId);
    expect(data?.length).toBe(0);
  });

  it("INSERT not granted to authenticated (RPC-only writes)", async () => {
    const insert = await ctx.userA.client.from("transaction_import_links").insert({
      transaction_id: txId,
      user_id: ctx.userA.userId,
      bank_account_id: "00000000-0000-0000-0000-000000000000",
      session_id: "00000000-0000-0000-0000-000000000000",
      row_id: "00000000-0000-0000-0000-000000000000",
      source_file_hash: "x",
      source_row_index: 1,
      fingerprint: "y",
    } as never);
    expect(insert.error).not.toBeNull();
  });

  it("UPDATE not granted to authenticated", async () => {
    const update = await ctx.userA.client
      .from("transaction_import_links")
      .update({ fingerprint: "tampered" } as never)
      .eq("transaction_id", txId);
    expect(update.error).not.toBeNull();
  });

  it("DELETE not granted to authenticated", async () => {
    const del = await ctx.userA.client
      .from("transaction_import_links")
      .delete()
      .eq("transaction_id", txId);
    expect(del.error).not.toBeNull();
  });
});
