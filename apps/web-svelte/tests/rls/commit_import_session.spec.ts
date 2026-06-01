import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

// Behavior spec for the commit_import_session RPC.
//
// Covers the full contract: status guard, rows_pending guard, account
// validation (own + not-archived + kind match), category visibility
// (system / own / group-shared / type match), group membership, per-row
// savepoint on unique_violation (duplicates_commit), pre-validation
// rollback (session stays preview), fingerprint_warnings shape, and counts.

describe("RPC: commit_import_session", () => {
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
    // Each test seeds its own account; unique idx (user_id, kind) WHERE archived_at IS NULL
    // means we must reset between tests so multiple ING/mBank accounts don't collide.
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  type Seed = {
    accountId: string;
    sessionId: string;
    categoryId: string;
    fileHash: string;
  };

  async function seedAccountAndSession(opts?: {
    user?: "A" | "B";
    archive?: boolean;
    detectedKind?: "ing" | "mbank";
    accountKind?: "ing" | "mbank";
    fileSuffix?: string;
  }): Promise<Seed> {
    const userId = (opts?.user ?? "A") === "A" ? ctx.userA.userId : ctx.userB.userId;
    const detectedKind = opts?.detectedKind ?? "ing";
    const accountKind = opts?.accountKind ?? detectedKind;
    const fileSuffix = opts?.fileSuffix ?? Math.random().toString(36).slice(2, 8);

    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({
        user_id: userId,
        kind: accountKind,
        label: `${SENTINEL} acct-${fileSuffix}`,
        archived_at: opts?.archive ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (acct.error) throw acct.error;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: userId,
        bank_account_id: acct.data.id,
        source_file_hash: `hash-${SENTINEL}-${fileSuffix}`,
        detected_kind: detectedKind,
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;

    const cat = await ctx.admin
      .from("categories")
      .insert({
        user_id: userId,
        name: `${SENTINEL} cat-${fileSuffix}`,
        type: "expense",
      })
      .select("id")
      .single();
    if (cat.error) throw cat.error;

    return {
      accountId: acct.data.id,
      sessionId: sess.data.id,
      categoryId: cat.data.id,
      fileHash: `hash-${SENTINEL}-${fileSuffix}`,
    };
  }

  async function insertRow(
    sessionId: string,
    opts: {
      rowIndex: number;
      decision?: "import" | "skip" | "duplicate" | "pending";
      categoryId?: string | null;
      groupId?: string | null;
      type?: "income" | "expense";
      amount?: number;
      description?: string;
      counterparty?: string | null;
      externalId?: string | null;
      postedAt?: string;
      rawHashSuffix?: string;
    },
  ): Promise<string> {
    const res = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: sessionId,
        row_index: opts.rowIndex,
        posted_at: opts.postedAt ?? "2026-01-15",
        amount: opts.amount ?? 10,
        type: opts.type ?? "expense",
        description: opts.description ?? `${SENTINEL} desc r${opts.rowIndex}`,
        counterparty: opts.counterparty ?? null,
        currency: "PLN",
        external_id: opts.externalId ?? null,
        raw_row_hash: `rh-${SENTINEL}-${opts.rawHashSuffix ?? `${sessionId.slice(0, 6)}-${opts.rowIndex}`}`,
        selected_category_id: opts.categoryId === undefined ? null : opts.categoryId,
        selected_group_id: opts.groupId ?? null,
        decision: opts.decision ?? "import",
      })
      .select("id")
      .single();
    if (res.error) throw res.error;
    return res.data.id;
  }

  async function callCommit(client: TestContext["userA"]["client"], sessionId: string) {
    return client.rpc("commit_import_session", { p_session_id: sessionId });
  }

  it("rejects non-preview status (committed/cancelled)", async () => {
    const seed = await seedAccountAndSession();
    await ctx.admin
      .from("transaction_import_sessions")
      .update({ status: "cancelled" })
      .eq("id", seed.sessionId);

    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/session_not_committable/);
  });

  it("rejects when any row is still 'pending'", async () => {
    const seed = await seedAccountAndSession();
    await insertRow(seed.sessionId, {
      rowIndex: 0,
      decision: "pending",
      categoryId: seed.categoryId,
    });

    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/rows_pending/);
  });

  it("rejects archived bank account", async () => {
    const seed = await seedAccountAndSession({ archive: true });
    // No rows needed — account check runs first.
    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/account_invalid/);
  });

  it("rejects account/session kind mismatch", async () => {
    const seed = await seedAccountAndSession({ detectedKind: "ing", accountKind: "mbank" });
    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/account_kind_mismatch/);
  });

  it("rejects foreign category (owned by another user, not group-shared)", async () => {
    const seed = await seedAccountAndSession();
    // Category owned by user B → not visible to user A.
    const otherCat = await ctx.admin
      .from("categories")
      .insert({ user_id: ctx.userB.userId, name: `${SENTINEL} cat-foreign`, type: "expense" })
      .select("id")
      .single();
    if (otherCat.error) throw otherCat.error;

    await insertRow(seed.sessionId, { rowIndex: 0, categoryId: otherCat.data.id });

    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/category_invalid/);

    // Session must still be 'preview' (validation error → rollback).
    const after = await ctx.admin
      .from("transaction_import_sessions")
      .select("status")
      .eq("id", seed.sessionId)
      .single();
    expect(after.data?.status).toBe("preview");
  });

  it("rejects type mismatch (category.type != row.type)", async () => {
    const seed = await seedAccountAndSession();
    // Category is 'expense' (default in seed); insert an income row.
    await insertRow(seed.sessionId, {
      rowIndex: 0,
      categoryId: seed.categoryId,
      type: "income",
    });

    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/category_invalid/);
  });

  it("rejects non-member group", async () => {
    const seed = await seedAccountAndSession();
    // Group owned by user B; user A is not a member.
    const grp = await ctx.admin
      .from("user_groups")
      .insert({ name: `${SENTINEL} grp-foreign`, owner_id: ctx.userB.userId })
      .select("id")
      .single();
    if (grp.error) throw grp.error;
    await ctx.admin
      .from("group_members")
      .insert({ group_id: grp.data.id, user_id: ctx.userB.userId, role: "owner" });

    await insertRow(seed.sessionId, {
      rowIndex: 0,
      categoryId: seed.categoryId,
      groupId: grp.data.id,
    });

    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/group_forbidden/);
  });

  it("uncategorized import row falls back to the caller's 'Inne wydatki' default", async () => {
    const seed = await seedAccountAndSession();
    await insertRow(seed.sessionId, {
      rowIndex: 0,
      decision: "import",
      categoryId: null,
      description: `${SENTINEL} INNE r0`,
    });

    const { data, error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();
    expect((data as { inserted: number }).inserted).toBe(1);

    const inne = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .eq("type", "expense")
      .eq("name", "Inne wydatki")
      .single();
    expect(inne.error).toBeNull();

    const tx = await ctx.admin
      .from("transactions")
      .select("category_id")
      .eq("user_id", ctx.userA.userId)
      .eq("description", `${SENTINEL} INNE r0`)
      .single();
    expect(tx.error).toBeNull();
    expect(tx.data?.category_id).toBe(inne.data?.id);
  });

  it("happy path: counts skipped + duplicate + inserted; tx + link created", async () => {
    const seed = await seedAccountAndSession();
    await insertRow(seed.sessionId, {
      rowIndex: 0,
      decision: "import",
      categoryId: seed.categoryId,
      description: `${SENTINEL} HAPPY r0`,
      externalId: `ext-${SENTINEL}-h0`,
    });
    await insertRow(seed.sessionId, {
      rowIndex: 1,
      decision: "skip",
      categoryId: seed.categoryId,
    });
    await insertRow(seed.sessionId, {
      rowIndex: 2,
      decision: "duplicate",
      categoryId: seed.categoryId,
    });

    const { data, error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();
    const out = data as {
      inserted: number;
      duplicates_preview: number;
      duplicates_commit: number;
      skipped: number;
      fingerprint_warnings: unknown[];
    };
    expect(out).toEqual({
      inserted: 1,
      duplicates_preview: 1,
      duplicates_commit: 0,
      skipped: 1,
      fingerprint_warnings: [],
    });

    // Session moved to committed; counts persisted.
    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .select("status, rows_committed, rows_skipped, rows_duplicate, committed_at")
      .eq("id", seed.sessionId)
      .single();
    expect(sess.data).toMatchObject({
      status: "committed",
      rows_committed: 1,
      rows_skipped: 1,
      rows_duplicate: 1,
    });
    expect(sess.data?.committed_at).not.toBeNull();

    // Tx + link exist and point at the row.
    const link = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id, external_transaction_id, source_row_index, fingerprint")
      .eq("session_id", seed.sessionId)
      .single();
    expect(link.error).toBeNull();
    expect(link.data?.external_transaction_id).toBe(`ext-${SENTINEL}-h0`);
    expect(link.data?.source_row_index).toBe(0);
    expect(link.data?.fingerprint).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("duplicates_commit: unique_violation in same session → counted, not aborted", async () => {
    const seed = await seedAccountAndSession();
    // Two rows with the SAME external_id → second link insert hits
    // (user_id, bank_account_id, external_transaction_id) unique index.
    await insertRow(seed.sessionId, {
      rowIndex: 0,
      categoryId: seed.categoryId,
      externalId: `ext-${SENTINEL}-DUP`,
      description: `${SENTINEL} DUP r0`,
    });
    await insertRow(seed.sessionId, {
      rowIndex: 1,
      categoryId: seed.categoryId,
      externalId: `ext-${SENTINEL}-DUP`,
      description: `${SENTINEL} DUP r1`,
    });

    const { data, error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();
    const out = data as { inserted: number; duplicates_commit: number };
    expect(out.inserted).toBe(1);
    expect(out.duplicates_commit).toBe(1);

    // Only one link survives; the failed row's tx was rolled back by savepoint.
    const links = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id")
      .eq("session_id", seed.sessionId);
    expect(links.data?.length).toBe(1);

    // Sentinel-tagged transactions count: exactly one created.
    const txs = await ctx.admin
      .from("transactions")
      .select("id, description")
      .like("description", `${SENTINEL} DUP%`)
      .order("description");
    expect(txs.data?.length).toBe(1);
    const winnerId = txs.data![0].id;

    // F3: the losing row must be marked decision='duplicate' with
    // duplicate_of pointing at the winning tx. The winning row stays 'import'
    // and gets transaction_id set. Audit row must not be misleading.
    const rows = await ctx.admin
      .from("transaction_import_rows")
      .select("row_index, decision, duplicate_of, transaction_id")
      .eq("session_id", seed.sessionId)
      .order("row_index");
    expect(rows.error).toBeNull();
    const r0 = rows.data!.find((r) => r.row_index === 0)!;
    const r1 = rows.data!.find((r) => r.row_index === 1)!;
    expect(r0).toMatchObject({
      decision: "import",
      transaction_id: winnerId,
      duplicate_of: null,
    });
    expect(r1).toMatchObject({
      decision: "duplicate",
      transaction_id: null,
      duplicate_of: winnerId,
    });
  });

  it("validation mid-loop → full rollback (no tx, no link, session stays preview)", async () => {
    const seed = await seedAccountAndSession();
    // Row 0 valid, row 1 invalid (foreign group). Pre-validate loop catches
    // row 1 BEFORE any insert runs → nothing persists.
    const foreignGrp = await ctx.admin
      .from("user_groups")
      .insert({ name: `${SENTINEL} grp-rb`, owner_id: ctx.userB.userId })
      .select("id")
      .single();
    if (foreignGrp.error) throw foreignGrp.error;
    await ctx.admin
      .from("group_members")
      .insert({ group_id: foreignGrp.data.id, user_id: ctx.userB.userId, role: "owner" });

    await insertRow(seed.sessionId, {
      rowIndex: 0,
      categoryId: seed.categoryId,
      description: `${SENTINEL} RB r0`,
    });
    await insertRow(seed.sessionId, {
      rowIndex: 1,
      categoryId: seed.categoryId,
      groupId: foreignGrp.data.id,
      description: `${SENTINEL} RB r1`,
    });

    const { error } = await callCommit(ctx.userA.client, seed.sessionId);
    expect(error?.message).toMatch(/group_forbidden/);

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .select("status, rows_committed")
      .eq("id", seed.sessionId)
      .single();
    expect(sess.data?.status).toBe("preview");
    expect(sess.data?.rows_committed).toBe(0);

    const txs = await ctx.admin
      .from("transactions")
      .select("id")
      .like("description", `${SENTINEL} RB%`);
    expect(txs.data?.length).toBe(0);
  });

  it("fingerprint_warnings: includes matched transaction context", async () => {
    // Commit session A with one row → creates link with fingerprint X.
    // Use different bank kinds for A vs B so (user_id, kind, archived_at IS NULL)
    // unique idx doesn't fire.
    const seedA = await seedAccountAndSession({
      fileSuffix: "fp-A",
      detectedKind: "ing",
    });
    await insertRow(seedA.sessionId, {
      rowIndex: 0,
      categoryId: seedA.categoryId,
      description: `${SENTINEL} FP-SAME`,
      counterparty: "Acme",
      amount: 42.5,
      postedAt: "2026-02-10",
      externalId: `ext-${SENTINEL}-fpA`,
    });
    const commitA = await callCommit(ctx.userA.client, seedA.sessionId);
    expect(commitA.error).toBeNull();
    const linkA = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id, fingerprint")
      .eq("session_id", seedA.sessionId)
      .single();
    if (linkA.error) throw linkA.error;

    // Session B: different account+file_hash, same normalized row contents,
    // posted_at within ±3 days → fingerprint match → warning emitted.
    const seedB = await seedAccountAndSession({
      fileSuffix: "fp-B",
      detectedKind: "mbank",
    });
    const rowBId = await insertRow(seedB.sessionId, {
      rowIndex: 0,
      categoryId: seedB.categoryId,
      description: `${SENTINEL} FP-SAME`,
      counterparty: "Acme",
      amount: 42.5,
      postedAt: "2026-02-12", // +2 days, within window
      externalId: `ext-${SENTINEL}-fpB`,
    });

    const { data, error } = await callCommit(ctx.userA.client, seedB.sessionId);
    expect(error).toBeNull();
    const out = data as {
      inserted: number;
      fingerprint_warnings: Array<Record<string, unknown>>;
    };
    expect(out.inserted).toBe(1); // soft warning, not a hard skip
    expect(out.fingerprint_warnings).toHaveLength(1);

    const warn = out.fingerprint_warnings[0];
    expect(Object.keys(warn).sort()).toEqual(warningKeys);
    expect(warn.row_id).toBe(rowBId);
    expect(warn.duplicate_of_transaction_id).toBe(linkA.data.transaction_id);
    expect(warn).toMatchObject({
      duplicate_of_amount: 42.5,
      duplicate_of_currency: "PLN",
      duplicate_of_date: "2026-02-10",
      duplicate_of_description: `${SENTINEL} FP-SAME`,
    });
  });

  it("foreign session: user B cannot commit user A's session", async () => {
    const seed = await seedAccountAndSession({ user: "A" });
    await insertRow(seed.sessionId, { rowIndex: 0, categoryId: seed.categoryId });

    const { error } = await callCommit(ctx.userB.client, seed.sessionId);
    expect(error?.message).toMatch(/session_not_found/);
  });
});
