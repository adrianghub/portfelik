import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

// Path B/C coverage for preview_fingerprint_warnings + commit_import_session.
// Plan-linked expenses and manual/non-plan transactions must surface
// as warnings when an import row matches by type/amount/currency/date window
// and the caller can see the transaction.

describe("Path B/C: cross-source duplicate warnings (preview + commit)", () => {
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

  async function makePlanLinkedExpenseTx(opts: {
    suffix: string;
    txUserId: string;
    amount: number;
    currency?: string;
    txDate: string; // ISO date or timestamp
    txType?: "expense" | "income";
    hasPlan?: boolean;
    txGroupId?: string | null;
  }): Promise<{ planId: string | null; txId: string; categoryId: string }> {
    const currency = opts.currency ?? "PLN";
    const hasPlan = opts.hasPlan ?? true;
    const txType = opts.txType ?? "expense";

    const cat = await ctx.admin
      .from("categories")
      .insert({
        user_id: opts.txUserId,
        name: `${SENTINEL} cat-tx-${opts.suffix}`,
        type: txType,
      })
      .select("id")
      .single();
    if (cat.error) throw cat.error;

    let planId: string | null = null;
    if (hasPlan) {
      const plan = await ctx.admin
        .from("plans")
        .insert({
          user_id: opts.txUserId,
          name: `${SENTINEL} plan-${opts.suffix}`,
          category_id: cat.data.id,
          kind: txType === "income" ? "save" : "debt",
          budget_amount: null,
          target_amount: txType === "income" ? opts.amount : null,
          start_date: "2026-03-01",
          end_date: "2026-03-31",
          group_id: opts.txGroupId ?? null,
        })
        .select("id")
        .single();
      if (plan.error) throw plan.error;
      planId = plan.data.id;
    }

    const tx = await ctx.admin
      .from("transactions")
      .insert({
        user_id: opts.txUserId,
        amount: opts.amount,
        currency,
        description: `${SENTINEL} tx-${opts.suffix}`,
        date: opts.txDate,
        type: txType,
        status: "paid",
        category_id: cat.data.id,
        group_id: opts.txGroupId ?? null,
      })
      .select("id")
      .single();
    if (tx.error) throw tx.error;

    if (planId) {
      const link = await ctx.admin.from("plan_transaction_links").insert({
        plan_id: planId,
        transaction_id: tx.data.id,
        created_by: opts.txUserId,
      });
      if (link.error) throw link.error;
    }

    return { planId, txId: tx.data.id, categoryId: cat.data.id };
  }

  async function makeImportSessionAndRow(opts: {
    suffix: string;
    sessionUserId: string;
    postedAt: string;
    amount: number;
    currency?: string;
    rowType?: "expense" | "income";
    categoryId?: string | null;
    decision?: "import" | "skip" | "duplicate" | "pending";
  }): Promise<{ sessionId: string; rowId: string; accountId: string }> {
    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({
        user_id: opts.sessionUserId,
        kind: "ing",
        label: `${SENTINEL} acct-${opts.suffix}`,
      })
      .select("id")
      .single();
    if (acct.error) throw acct.error;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: opts.sessionUserId,
        bank_account_id: acct.data.id,
        source_file_hash: `hash-${SENTINEL}-${opts.suffix}`,
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
        posted_at: opts.postedAt,
        amount: opts.amount,
        type: opts.rowType ?? "expense",
        description: `${SENTINEL} row-${opts.suffix}`,
        counterparty: null,
        currency: opts.currency ?? "PLN",
        external_id: `ext-${SENTINEL}-${opts.suffix}`,
        raw_row_hash: `rh-${SENTINEL}-${opts.suffix}-0`,
        selected_category_id: opts.categoryId ?? null,
        decision: opts.decision ?? "pending",
      })
      .select("id")
      .single();
    if (row.error) throw row.error;

    return { sessionId: sess.data.id, rowId: row.data.id, accountId: acct.data.id };
  }

  it("warns when a matching plan-linked expense exists (within ±3 days)", async () => {
    const fixture = await makePlanLinkedExpenseTx({
      suffix: "match-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
    });

    const preview = await makeImportSessionAndRow({
      suffix: "match-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12", // +2 days, in-window
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    const warnings = data as Array<Record<string, unknown>>;
    expect(warnings).toHaveLength(1);
    const w = warnings[0];
    expect(Object.keys(w).sort()).toEqual(warningKeys);
    expect(w.row_id).toBe(preview.rowId);
    expect(w.duplicate_of_transaction_id).toBe(fixture.txId);
    expect(w).toMatchObject({
      duplicate_of_amount: 42.5,
      duplicate_of_currency: "PLN",
      duplicate_of_date: "2026-03-10",
      duplicate_of_description: `${SENTINEL} tx-match-A`,
    });
  });

  it("warns for a matching manual/non-plan expense within ±1 day", async () => {
    const fixture = await makePlanLinkedExpenseTx({
      suffix: "nolist-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
      hasPlan: false,
    });

    const preview = await makeImportSessionAndRow({
      suffix: "nolist-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-11",
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    const warnings = data as Array<Record<string, unknown>>;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      row_id: preview.rowId,
      duplicate_of_transaction_id: fixture.txId,
      duplicate_of_date: "2026-03-10",
      duplicate_of_amount: 42.5,
      duplicate_of_currency: "PLN",
      duplicate_of_description: `${SENTINEL} tx-nolist-A`,
    });
  });

  it("ignores manual/non-plan candidates outside the tighter ±1-day window", async () => {
    await makePlanLinkedExpenseTx({
      suffix: "nolist-window-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
      hasPlan: false,
    });

    const preview = await makeImportSessionAndRow({
      suffix: "nolist-window-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("ignores amount mismatch", async () => {
    await makePlanLinkedExpenseTx({
      suffix: "amt-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
    });

    const preview = await makeImportSessionAndRow({
      suffix: "amt-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.51, // off by one cent
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("ignores currency mismatch", async () => {
    await makePlanLinkedExpenseTx({
      suffix: "ccy-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      currency: "PLN",
      txDate: "2026-03-10T12:00:00Z",
    });

    const preview = await makeImportSessionAndRow({
      suffix: "ccy-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
      currency: "EUR",
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("ignores tx whose date is outside the ±3-day window", async () => {
    await makePlanLinkedExpenseTx({
      suffix: "date-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-01T12:00:00Z",
    });

    const preview = await makeImportSessionAndRow({
      suffix: "date-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-11", // +10 days, out of window
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("ignores income transaction even when linked to a plan", async () => {
    await makePlanLinkedExpenseTx({
      suffix: "inc-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
      txType: "income",
    });

    const preview = await makeImportSessionAndRow({
      suffix: "inc-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
      rowType: "expense",
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("does not leak another user's private plan-linked transaction", async () => {
    // userB owns a private plan+expense matching userA's fingerprint.
    await makePlanLinkedExpenseTx({
      suffix: "leak-B",
      txUserId: ctx.userB.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
    });

    // userA's import session against the same fingerprint.
    const preview = await makeImportSessionAndRow({
      suffix: "leak-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("does not leak another user's foreign-group plan-linked transaction", async () => {
    const { data: group, error: groupError } = await ctx.userB.client.rpc("create_group", {
      p_name: `${SENTINEL} hidden-dup-group-B`,
    });
    if (groupError || !group) throw groupError ?? new Error("no hidden group");

    await makePlanLinkedExpenseTx({
      suffix: "leak-group-B",
      txUserId: ctx.userB.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
      txGroupId: (group as { id: string }).id,
    });

    const preview = await makeImportSessionAndRow({
      suffix: "leak-group-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    expect(data as unknown[]).toHaveLength(0);
  });

  it("warns for a shared-group plan-linked transaction visible to the caller", async () => {
    const { data: group, error: groupError } = await ctx.userB.client.rpc("create_group", {
      p_name: `${SENTINEL} shared-dup-group-B`,
    });
    if (groupError || !group) throw groupError ?? new Error("no shared group");
    const groupId = (group as { id: string }).id;

    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userA.userId,
    });
    if (member.error) throw member.error;

    const fixture = await makePlanLinkedExpenseTx({
      suffix: "shared-group-B",
      txUserId: ctx.userB.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
      txGroupId: groupId,
    });

    const preview = await makeImportSessionAndRow({
      suffix: "shared-group-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
    });

    const { data, error } = await ctx.userA.client.rpc("preview_fingerprint_warnings", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    const warnings = data as Array<Record<string, unknown>>;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      row_id: preview.rowId,
      duplicate_of_transaction_id: fixture.txId,
    });
  });

  it("commit_import_session emits the same warning shape as preview", async () => {
    const fixture = await makePlanLinkedExpenseTx({
      suffix: "commit-A",
      txUserId: ctx.userA.userId,
      amount: 42.5,
      txDate: "2026-03-10T12:00:00Z",
    });

    // Use a fresh category for the row to avoid coupling to the plan's category.
    const rowCat = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} cat-commit-row-A`,
        type: "expense",
      })
      .select("id")
      .single();
    if (rowCat.error) throw rowCat.error;

    const preview = await makeImportSessionAndRow({
      suffix: "commit-A",
      sessionUserId: ctx.userA.userId,
      postedAt: "2026-03-12",
      amount: 42.5,
      categoryId: rowCat.data.id,
      decision: "import",
    });

    const { data, error } = await ctx.userA.client.rpc("commit_import_session", {
      p_session_id: preview.sessionId,
    });
    expect(error).toBeNull();
    const result = data as {
      inserted: number;
      fingerprint_warnings: Array<Record<string, unknown>>;
    };
    expect(result.inserted).toBe(1);
    expect(result.fingerprint_warnings).toHaveLength(1);
    const w = result.fingerprint_warnings[0];
    expect(Object.keys(w).sort()).toEqual(warningKeys);
    expect(w.row_id).toBe(preview.rowId);
    // The plan-linked tx is the original; the freshly inserted import tx
    // is excluded by the `t.id <> v_new_tx_id` guard, so the warning points
    // back to the plan-linked transaction.
    expect(w.duplicate_of_transaction_id).toBe(fixture.txId);
    expect(w).toMatchObject({
      duplicate_of_date: "2026-03-10",
      duplicate_of_amount: 42.5,
      duplicate_of_currency: "PLN",
      duplicate_of_description: `${SENTINEL} tx-commit-A`,
    });
  });
});
