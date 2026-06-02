import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

// Behavior spec for the mark_preview_duplicates RPC (bank import v2, issue #73).
//
// The RPC scans every import row in a preview session for a probable duplicate
// and, for rows still decision='import', flips them to decision='duplicate'
// (+ duplicate_of). It returns the same warning shape as
// preview_fingerprint_warnings. skip / already-duplicate rows are NOT flipped
// (idempotent). It raises session_not_found (P0002) for a foreign session and
// session_not_in_preview_state (P0001) when status != 'preview'.
//
// These cases drive Path C: a manual / non-list transactions row with the SAME
// type + amount + currency within ±1 day of the import row's posted_at, not
// linked via transaction_import_links.

describe("RPC: mark_preview_duplicates", () => {
  let ctx: TestContext;
  const ROW_DATE = "2026-03-10";
  const MATCH_AMOUNT = 88.45;
  const NO_MATCH_AMOUNT = 13.37;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  type Seed = { accountId: string; sessionId: string; fileSuffix: string };

  async function seedSession(opts?: { user?: "A" | "B" }): Promise<Seed> {
    const userId = (opts?.user ?? "A") === "A" ? ctx.userA.userId : ctx.userB.userId;
    const fileSuffix = Math.random().toString(36).slice(2, 8);

    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: userId, kind: "ing", label: `${SENTINEL} acct-${fileSuffix}` })
      .select("id")
      .single();
    if (acct.error) throw acct.error;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: userId,
        bank_account_id: acct.data.id,
        source_file_hash: `hash-${SENTINEL}-${fileSuffix}`,
        detected_kind: "ing",
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;

    return { accountId: acct.data.id, sessionId: sess.data.id, fileSuffix };
  }

  async function seedCategory(opts?: { user?: "A" | "B" }): Promise<string> {
    const userId = (opts?.user ?? "A") === "A" ? ctx.userA.userId : ctx.userB.userId;
    const res = await ctx.admin
      .from("categories")
      .insert({
        user_id: userId,
        name: `${SENTINEL} cat-${Math.random().toString(36).slice(2, 8)}`,
        type: "expense",
      })
      .select("id")
      .single();
    if (res.error) throw res.error;
    return res.data.id;
  }

  // A manual (non-list, unlinked) expense transaction that Path C can match.
  async function seedManualTx(opts?: {
    user?: "A" | "B";
    amount?: number;
    date?: string;
    description?: string;
  }): Promise<string> {
    const userId = (opts?.user ?? "A") === "A" ? ctx.userA.userId : ctx.userB.userId;
    const categoryId = await seedCategory({ user: opts?.user });
    const res = await ctx.admin
      .from("transactions")
      .insert({
        user_id: userId,
        category_id: categoryId,
        amount: opts?.amount ?? MATCH_AMOUNT,
        type: "expense",
        currency: "PLN",
        date: opts?.date ?? ROW_DATE,
        description: opts?.description ?? `${SENTINEL} MANUAL TX`,
      })
      .select("id")
      .single();
    if (res.error) throw res.error;
    return res.data.id;
  }

  async function insertRow(
    seed: Pick<Seed, "sessionId" | "fileSuffix">,
    opts: {
      rowIndex: number;
      amount?: number;
      decision?: "import" | "skip" | "duplicate" | "pending";
      duplicateOf?: string;
      postedAt?: string;
      description?: string;
    }
  ): Promise<string> {
    const res = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: seed.sessionId,
        row_index: opts.rowIndex,
        posted_at: opts.postedAt ?? ROW_DATE,
        amount: opts.amount ?? MATCH_AMOUNT,
        type: "expense",
        currency: "PLN",
        description: opts.description ?? `${SENTINEL} row r${opts.rowIndex}`,
        raw_row_hash: `rh-${SENTINEL}-${seed.fileSuffix}-${opts.rowIndex}`,
        decision: opts.decision ?? "import",
        duplicate_of: opts.duplicateOf ?? null,
      })
      .select("id")
      .single();
    if (res.error) throw res.error;
    return res.data.id;
  }

  function callRpc(client: TestContext["userA"]["client"], sessionId: string) {
    return client.rpc("mark_preview_duplicates", { p_session_id: sessionId });
  }

  type Warning = { row_id: string; duplicate_of_transaction_id: string };

  it("flips a row matching an existing manual transaction to 'duplicate'", async () => {
    const txId = await seedManualTx(); // ROW_DATE, exact amount/currency/type
    const seed = await seedSession();
    // Import row posted one day later → within Path C's ±1 day window.
    const rowId = await insertRow(seed, { rowIndex: 0, postedAt: "2026-03-11" });

    const { data, error } = await callRpc(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    const warnings = data as Warning[];
    const match = warnings.find((w) => w.row_id === rowId);
    expect(match).toBeDefined();
    expect(match?.duplicate_of_transaction_id).toBe(txId);

    const after = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of")
      .eq("id", rowId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.decision).toBe("duplicate");
    expect(after.data?.duplicate_of).toBe(txId);
  });

  it("leaves a non-matching row as 'import' with no warning", async () => {
    await seedManualTx(); // matches MATCH_AMOUNT only
    const seed = await seedSession();
    const rowId = await insertRow(seed, { rowIndex: 0, amount: NO_MATCH_AMOUNT });

    const { data, error } = await callRpc(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    const warnings = data as Warning[];
    expect(warnings.find((w) => w.row_id === rowId)).toBeUndefined();

    const after = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of")
      .eq("id", rowId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.decision).toBe("import");
    expect(after.data?.duplicate_of).toBeNull();
  });

  it("does not flip a user-skipped row even when it matches", async () => {
    await seedManualTx();
    const seed = await seedSession();
    // Pre-set the matching row to 'skip' → RPC must leave it untouched.
    const rowId = await insertRow(seed, { rowIndex: 0, decision: "skip" });

    const { data, error } = await callRpc(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    // It still matches, so a warning is emitted, but the decision is preserved.
    const warnings = data as Warning[];
    expect(warnings.find((w) => w.row_id === rowId)).toBeDefined();

    const after = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of")
      .eq("id", rowId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.decision).toBe("skip");
    expect(after.data?.duplicate_of).toBeNull();
  });

  it("does not overwrite an already-duplicate row's existing duplicate_of (idempotent)", async () => {
    // A different manual tx that Path C would also match on amount/currency/date.
    const newMatchTxId = await seedManualTx();
    // A pre-existing duplicate_of pointer the RPC must NOT clobber.
    const priorTxId = await seedManualTx({
      amount: NO_MATCH_AMOUNT,
      description: `${SENTINEL} PRIOR`,
    });
    const seed = await seedSession();
    // Row already marked duplicate against priorTxId, but still matches newMatchTxId.
    const rowId = await insertRow(seed, {
      rowIndex: 0,
      postedAt: "2026-03-11",
      decision: "duplicate",
      duplicateOf: priorTxId,
    });

    const { data, error } = await callRpc(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    // It still matches, so a warning is emitted, but the decision/pointer are preserved.
    const warnings = data as Warning[];
    expect(warnings.find((w) => w.row_id === rowId)).toBeDefined();
    // The freshly matched tx exists but the RPC must not have repointed the row to it.
    expect(newMatchTxId).not.toBe(priorTxId);

    const after = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of")
      .eq("id", rowId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data?.decision).toBe("duplicate");
    expect(after.data?.duplicate_of).toBe(priorTxId);
  });

  it("raises session_not_found when another user calls it", async () => {
    const seed = await seedSession({ user: "A" });
    const { error } = await callRpc(ctx.userB.client, seed.sessionId);
    expect(error?.message ?? "").toMatch(/session_not_found/);
  });

  it("raises session_not_in_preview_state when the session is not in preview", async () => {
    const seed = await seedSession();
    await ctx.admin
      .from("transaction_import_sessions")
      .update({ status: "cancelled" })
      .eq("id", seed.sessionId);

    const { error } = await callRpc(ctx.userA.client, seed.sessionId);
    expect(error?.message ?? "").toMatch(/session_not_in_preview_state/);
  });
});
