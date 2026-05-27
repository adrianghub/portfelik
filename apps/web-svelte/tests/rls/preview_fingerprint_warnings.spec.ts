import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

// Behavior spec for preview_fingerprint_warnings — pre-commit probable-dup scan.
// Must use the same fingerprint formula as commit_import_session and the same
// ±3-day window. Result shape includes matched-transaction context so the UI can
// show what the duplicate badge refers to.

describe("RPC: preview_fingerprint_warnings", () => {
  let ctx: TestContext;
  const warningKeys = [
    "duplicate_of_amount",
    "duplicate_of_currency",
    "duplicate_of_date",
    "duplicate_of_description",
    "duplicate_of_transaction_id",
    "row_id",
  ];

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  async function setupCommittedSession(opts: {
    fileSuffix: string;
    kind: "ing" | "mbank";
    description: string;
    counterparty?: string | null;
    amount: number;
    postedAt: string;
    externalId: string;
  }) {
    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({
        user_id: ctx.userA.userId,
        kind: opts.kind,
        label: `${SENTINEL} acct-${opts.fileSuffix}`,
      })
      .select("id")
      .single();
    if (acct.error) throw acct.error;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: acct.data.id,
        source_file_hash: `hash-${SENTINEL}-${opts.fileSuffix}`,
        detected_kind: opts.kind,
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;

    const cat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} cat-${opts.fileSuffix}`, type: "expense" })
      .select("id")
      .single();
    if (cat.error) throw cat.error;

    const row = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: sess.data.id,
        row_index: 0,
        posted_at: opts.postedAt,
        amount: opts.amount,
        type: "expense",
        description: opts.description,
        counterparty: opts.counterparty ?? null,
        currency: "PLN",
        external_id: opts.externalId,
        raw_row_hash: `rh-${SENTINEL}-${opts.fileSuffix}-0`,
        selected_category_id: cat.data.id,
        decision: "import",
      })
      .select("id")
      .single();
    if (row.error) throw row.error;

    const commit = await ctx.userA.client.rpc("commit_import_session", {
      p_session_id: sess.data.id,
    });
    if (commit.error) throw commit.error;

    return { accountId: acct.data.id, categoryId: cat.data.id };
  }

  async function setupPreviewSession(opts: {
    accountId: string;
    categoryId: string;
    fileSuffix: string;
    kind: "ing" | "mbank";
    rows: Array<{
      rowIndex: number;
      description: string;
      counterparty?: string | null;
      amount: number;
      postedAt: string;
      externalId?: string | null;
    }>;
  }): Promise<{ sessionId: string; rowIds: string[] }> {
    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: opts.accountId,
        source_file_hash: `hash-${SENTINEL}-${opts.fileSuffix}`,
        detected_kind: opts.kind,
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;

    const rowIds: string[] = [];
    for (const r of opts.rows) {
      const ins = await ctx.admin
        .from("transaction_import_rows")
        .insert({
          session_id: sess.data.id,
          row_index: r.rowIndex,
          posted_at: r.postedAt,
          amount: r.amount,
          type: "expense",
          description: r.description,
          counterparty: r.counterparty ?? null,
          currency: "PLN",
          external_id: r.externalId ?? null,
          raw_row_hash: `rh-${SENTINEL}-${opts.fileSuffix}-${r.rowIndex}`,
          selected_category_id: opts.categoryId,
          decision: "pending",
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      rowIds.push(ins.data.id);
    }
    return { sessionId: sess.data.id, rowIds };
  }

  it("flags a row whose fingerprint matches a previously imported tx (within ±3 days)", async () => {
    const seed = await setupCommittedSession({
      fileSuffix: "fp-prev-A",
      kind: "ing",
      description: `${SENTINEL} FP MATCH`,
      counterparty: "Acme",
      amount: 99.5,
      postedAt: "2026-03-10",
      externalId: `ext-${SENTINEL}-fpA`,
    });

    // Second session, different account kind (so unique idx doesn't fire).
    const acctB = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "mbank", label: `${SENTINEL} acct-fp-B` })
      .select("id")
      .single();
    if (acctB.error) throw acctB.error;

    const preview = await setupPreviewSession({
      accountId: acctB.data.id,
      categoryId: seed.categoryId,
      fileSuffix: "fp-prev-B",
      kind: "mbank",
      rows: [
        {
          rowIndex: 0,
          description: `${SENTINEL} FP MATCH`,
          counterparty: "Acme",
          amount: 99.5,
          postedAt: "2026-03-12", // +2 days, in-window
          externalId: `ext-${SENTINEL}-fpB`,
        },
        {
          rowIndex: 1,
          description: `${SENTINEL} FP NO MATCH`,
          counterparty: "Different",
          amount: 7,
          postedAt: "2026-03-12",
          externalId: `ext-${SENTINEL}-fpC`,
        },
      ],
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    const warnings = data as Array<Record<string, unknown>>;
    expect(warnings).toHaveLength(1);

    const w = warnings[0];
    expect(Object.keys(w).sort()).toEqual(warningKeys);
    expect(w.row_id).toBe(preview.rowIds[0]);
    expect(typeof w.duplicate_of_transaction_id).toBe("string");
    expect(w).toMatchObject({
      duplicate_of_amount: 99.5,
      duplicate_of_currency: "PLN",
      duplicate_of_date: "2026-03-10",
      duplicate_of_description: `${SENTINEL} FP MATCH`,
    });
  });

  it("does NOT flag rows outside the ±3-day window even with matching fingerprint", async () => {
    const seed = await setupCommittedSession({
      fileSuffix: "fp-out-A",
      kind: "ing",
      description: `${SENTINEL} OUT WIN`,
      counterparty: "X",
      amount: 50,
      postedAt: "2026-04-01",
      externalId: `ext-${SENTINEL}-outA`,
    });

    const acctB = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "mbank", label: `${SENTINEL} acct-out-B` })
      .select("id")
      .single();
    if (acctB.error) throw acctB.error;

    const preview = await setupPreviewSession({
      accountId: acctB.data.id,
      categoryId: seed.categoryId,
      fileSuffix: "fp-out-B",
      kind: "mbank",
      rows: [
        {
          rowIndex: 0,
          description: `${SENTINEL} OUT WIN`,
          counterparty: "X",
          amount: 50,
          postedAt: "2026-04-08", // +7 days, out of window
          externalId: `ext-${SENTINEL}-outB`,
        },
      ],
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("foreign session: user B cannot scan user A's session", async () => {
    const seed = await setupCommittedSession({
      fileSuffix: "fp-foreign-A",
      kind: "ing",
      description: `${SENTINEL} FOR`,
      amount: 10,
      postedAt: "2026-05-01",
      externalId: `ext-${SENTINEL}-forA`,
    });

    const acctB = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "mbank", label: `${SENTINEL} acct-for-B` })
      .select("id")
      .single();
    if (acctB.error) throw acctB.error;

    const preview = await setupPreviewSession({
      accountId: acctB.data.id,
      categoryId: seed.categoryId,
      fileSuffix: "fp-for-B",
      kind: "mbank",
      rows: [{ rowIndex: 0, description: `${SENTINEL} FOR`, amount: 10, postedAt: "2026-05-02" }],
    });

    const { error } = await ctx.userB.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error?.message).toMatch(/session_not_found/);
  });

  it("does NOT leak another user's transaction even when fingerprint matches", async () => {
    // Seed user B's transaction with a known fingerprint.
    const bAcct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userB.userId, kind: "ing", label: `${SENTINEL} acct-leak-B` })
      .select("id")
      .single();
    if (bAcct.error) throw bAcct.error;

    const bSess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userB.userId,
        bank_account_id: bAcct.data.id,
        source_file_hash: `hash-${SENTINEL}-leak-B`,
        detected_kind: "ing",
      })
      .select("id")
      .single();
    if (bSess.error) throw bSess.error;

    const bCat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userB.userId, name: `${SENTINEL} cat-leak-B`, type: "expense" })
      .select("id")
      .single();
    if (bCat.error) throw bCat.error;

    await ctx.admin.from("transaction_import_rows").insert({
      session_id: bSess.data.id,
      row_index: 0,
      posted_at: "2026-06-01",
      amount: 33,
      type: "expense",
      description: `${SENTINEL} LEAK SAME`,
      currency: "PLN",
      external_id: `ext-${SENTINEL}-leakB`,
      raw_row_hash: `rh-${SENTINEL}-leak-B-0`,
      selected_category_id: bCat.data.id,
      decision: "import",
    });
    const commitB = await ctx.userB.client.rpc("commit_import_session", {
      p_session_id: bSess.data.id,
    });
    if (commitB.error) throw commitB.error;

    // Now user A previews a row with the same fingerprint — must see no warning.
    const aAcct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: ctx.userA.userId, kind: "ing", label: `${SENTINEL} acct-leak-A` })
      .select("id")
      .single();
    if (aAcct.error) throw aAcct.error;
    const aCat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userA.userId, name: `${SENTINEL} cat-leak-A`, type: "expense" })
      .select("id")
      .single();
    if (aCat.error) throw aCat.error;

    const preview = await setupPreviewSession({
      accountId: aAcct.data.id,
      categoryId: aCat.data.id,
      fileSuffix: "leak-A",
      kind: "ing",
      rows: [
        {
          rowIndex: 0,
          description: `${SENTINEL} LEAK SAME`,
          amount: 33,
          postedAt: "2026-06-02",
          externalId: `ext-${SENTINEL}-leakA`,
        },
      ],
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });
});
