import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: transaction_import_rows", () => {
  let ctx: TestContext;
  let sessionAId: string;
  let rowAId: string;
  const sourceData = {
    columns: [
      { label: "Data operacji", value: "15.01.2026" },
      { label: "Numer rachunku", value: "11 1010 0000 0000 0000 0000 0001" },
    ],
  };

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
        amount: 42.3,
        type: "expense",
        description: `${SENTINEL} BIEDRONKA`,
        currency: "PLN",
        raw_row_hash: `rowhash-${SENTINEL}`,
        source_data: sourceData,
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
      .select("id, source_data")
      .eq("session_id", sessionAId);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0]?.source_data).toEqual(sourceData);
  });

  it("user B does NOT see rows from user A's session", async () => {
    const { data } = await ctx.userB.client
      .from("transaction_import_rows")
      .select("id, source_data")
      .eq("id", rowAId);
    expect(data?.length).toBe(0);
  });

  it("a shared group does not expose private bank source cells", async () => {
    const group = await ctx.admin
      .from("user_groups")
      .insert({ name: `${SENTINEL} source-private`, owner_id: ctx.userA.userId })
      .select("id")
      .single();
    if (group.error) throw group.error;
    try {
      const members = await ctx.admin.from("group_members").upsert([
        { group_id: group.data.id, user_id: ctx.userA.userId },
        { group_id: group.data.id, user_id: ctx.userB.userId },
      ]);
      expect(members.error).toBeNull();
      const result = await ctx.userB.client
        .from("transaction_import_rows")
        .select("source_data")
        .eq("id", rowAId);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    } finally {
      await ctx.admin.from("user_groups").delete().eq("id", group.data.id);
    }
  });

  it("user A can update their own row decision", async () => {
    const result = await ctx.userA.client
      .from("transaction_import_rows")
      .update({ decision: "skip" })
      .eq("id", rowAId)
      .select();
    expect(result.error).toBeNull();
    expect(result.data?.[0]?.decision).toBe("skip");
    expect(result.data?.[0]?.source_data).toEqual(sourceData);
  });

  it("source cells cannot be modified by the owner during preview", async () => {
    const result = await ctx.userA.client
      .from("transaction_import_rows")
      .update({ source_data: { columns: [{ label: "Data operacji", value: "altered" }] } })
      .eq("id", rowAId);
    expect(result.error?.code).toBe("42501");
    const after = await ctx.userA.client
      .from("transaction_import_rows")
      .select("source_data")
      .eq("id", rowAId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.source_data).toEqual(sourceData);
  });

  it("rejects malformed source snapshots on insert", async () => {
    const result = await ctx.userA.client.from("transaction_import_rows").insert({
      session_id: sessionAId,
      row_index: 99,
      posted_at: "2026-01-15",
      amount: 1,
      type: "expense",
      description: `${SENTINEL} invalid source`,
      currency: "PLN",
      raw_row_hash: `invalid-${SENTINEL}`,
      source_data: { columns: [{ label: "Kwota", value: 123 }] },
    });
    expect(result.error?.code).toBe("23514");
  });

  it("DELETE not granted to authenticated - row survives the attempt", async () => {
    await ctx.userA.client.from("transaction_import_rows").delete().eq("id", rowAId);
    const after = await ctx.admin.from("transaction_import_rows").select("id").eq("id", rowAId);
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
