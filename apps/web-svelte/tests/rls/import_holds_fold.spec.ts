import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

// Behaviour spec for hold-aware tolerant folding (issue: import card holds).
//
// A committed hold carries is_hold + counterparty on its transaction_import_link.
// A later settled row that matches a kept hold by counterparty + ±3 days +
// amount tolerance (settle <= hold OR |Δ| <= max(50, 10% of hold)) is folded:
// commit_import_session updates the held transaction's amount/date, clears the
// hold flag on the link, marks the settled row decision='duplicate', and does
// NOT insert a new transaction. The preview matchers (mark_preview_duplicates /
// preview_fingerprint_warnings) step aside for hold-linked matches so the
// settled row survives to commit as decision='import'.

describe("import holds fold", () => {
  let ctx: TestContext;

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

  // One active bank_account is allowed per (user, kind), so each session uses a
  // distinct kind from the adapter set to avoid the unique-index collision.
  const KINDS = [
    "ing",
    "mbank",
    "pko_bp",
    "pekao",
    "erste",
    "millennium",
    "alior",
    "bnp_paribas",
    "citi_handlowy",
  ];
  let kindCursor = 0;

  async function seedSession(opts?: { user?: "A" | "B" }): Promise<Seed> {
    const userId = (opts?.user ?? "A") === "A" ? ctx.userA.userId : ctx.userB.userId;
    const fileSuffix = Math.random().toString(36).slice(2, 8);
    const kind = KINDS[kindCursor++ % KINDS.length];

    const acct = await ctx.admin
      .from("bank_accounts")
      .insert({ user_id: userId, kind, label: `${SENTINEL} acct-${fileSuffix}` })
      .select("id")
      .single();
    if (acct.error) throw acct.error;

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: userId,
        bank_account_id: acct.data.id,
        source_file_hash: `hash-${SENTINEL}-${fileSuffix}`,
        detected_kind: kind,
        status: "preview",
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

  async function insertRow(
    seed: Pick<Seed, "sessionId" | "fileSuffix">,
    opts: {
      rowIndex: number;
      amount?: number;
      type?: "expense" | "income";
      currency?: string;
      decision?: "import" | "skip" | "duplicate" | "pending";
      isHold?: boolean;
      postedAt?: string;
      counterparty?: string;
      description?: string;
      selectedCategoryId?: string;
    }
  ): Promise<string> {
    const res = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: seed.sessionId,
        row_index: opts.rowIndex,
        posted_at: opts.postedAt ?? "2026-06-19",
        amount: opts.amount ?? 200,
        type: opts.type ?? "expense",
        currency: opts.currency ?? "PLN",
        description: opts.description ?? `${SENTINEL} row r${opts.rowIndex}`,
        counterparty: opts.counterparty ?? null,
        raw_row_hash: `rh-${SENTINEL}-${seed.fileSuffix}-${opts.rowIndex}`,
        decision: opts.decision ?? "import",
        is_hold: opts.isHold ?? false,
        selected_category_id: opts.selectedCategoryId ?? null,
      })
      .select("id")
      .single();
    if (res.error) throw res.error;
    return res.data.id;
  }

  function commit(client: TestContext["userA"]["client"], sessionId: string) {
    return client.rpc("commit_import_session", { p_session_id: sessionId });
  }

  function markDuplicates(client: TestContext["userA"]["client"], sessionId: string) {
    return client.rpc("mark_preview_duplicates", { p_session_id: sessionId });
  }

  // Commit a single hold expense row and return the resulting transaction id +
  // its link id, after asserting the link is marked is_hold/counterparty.
  async function commitHold(opts: {
    counterparty: string;
    amount: number;
    postedAt: string;
    isHold?: boolean;
  }): Promise<{ txId: string; sessionId: string }> {
    const categoryId = await seedCategory();
    const seed = await seedSession();
    await insertRow(seed, {
      rowIndex: 0,
      amount: opts.amount,
      postedAt: opts.postedAt,
      counterparty: opts.counterparty,
      isHold: opts.isHold ?? true,
      selectedCategoryId: categoryId,
    });

    const { error } = await commit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    const link = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id, is_hold, counterparty")
      .eq("session_id", seed.sessionId)
      .single();
    if (link.error) throw link.error;

    return {
      txId: link.data.transaction_id as string,
      sessionId: seed.sessionId,
    };
  }

  it("commit marks a held row's import link is_hold=true and counterparty", async () => {
    const categoryId = await seedCategory();
    const seed = await seedSession();
    await insertRow(seed, {
      rowIndex: 0,
      amount: 200,
      postedAt: "2026-06-19",
      counterparty: `${SENTINEL} HYPEROIL`,
      isHold: true,
      selectedCategoryId: categoryId,
    });

    const { error } = await commit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    const link = await ctx.admin
      .from("transaction_import_links")
      .select("is_hold, counterparty")
      .eq("session_id", seed.sessionId)
      .single();
    expect(link.error).toBeNull();
    expect(link.data?.is_hold).toBe(true);
    expect(link.data?.counterparty).toBe(`${SENTINEL} HYPEROIL`);
  });

  it("folds a settled row into a kept hold within tolerance and updates the amount", async () => {
    const cp = `${SENTINEL} HYPEROIL`;
    const { txId } = await commitHold({
      counterparty: cp,
      amount: 200,
      postedAt: "2026-06-19",
    });

    // New session: same counterparty, settled at 199.93 one day later.
    const categoryId = await seedCategory();
    const seed = await seedSession();
    const rowId = await insertRow(seed, {
      rowIndex: 0,
      amount: 199.93,
      postedAt: "2026-06-20",
      counterparty: cp,
      isHold: false,
      selectedCategoryId: categoryId,
    });

    // Preview matchers must step aside (hold-linked match excluded from Path A).
    const mark = await markDuplicates(ctx.userA.client, seed.sessionId);
    expect(mark.error).toBeNull();
    const beforeCommit = await ctx.admin
      .from("transaction_import_rows")
      .select("decision")
      .eq("id", rowId)
      .single();
    expect(beforeCommit.data?.decision).toBe("import");

    const { error } = await commit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    // Settled row folded -> duplicate, points at the held tx.
    const row = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of")
      .eq("id", rowId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data?.decision).toBe("duplicate");
    expect(row.data?.duplicate_of).toBe(txId);

    // Held tx updated in place; no new transaction inserted.
    const tx = await ctx.admin
      .from("transactions")
      .select("id, amount, date")
      .eq("id", txId)
      .single();
    expect(tx.error).toBeNull();
    expect(Number(tx.data?.amount)).toBe(199.93);
    expect(String(tx.data?.date).startsWith("2026-06-20")).toBe(true);

    // Link hold flag cleared.
    const link = await ctx.admin
      .from("transaction_import_links")
      .select("is_hold")
      .eq("transaction_id", txId)
      .single();
    expect(link.error).toBeNull();
    expect(link.data?.is_hold).toBe(false);

    // Exactly one transaction exists for this counterparty.
    const all = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("description", `${SENTINEL}%`);
    expect(all.error).toBeNull();
    expect(all.data?.length).toBe(1);
  });

  it("does NOT fold when amount drift exceeds tolerance", async () => {
    const cp = `${SENTINEL} HYPEROIL`;
    const { txId } = await commitHold({
      counterparty: cp,
      amount: 200,
      postedAt: "2026-06-19",
    });

    // Settled at 260 (> hold, Δ=60 > max(50, 20)) -> must NOT fold.
    const categoryId = await seedCategory();
    const seed = await seedSession();
    const rowId = await insertRow(seed, {
      rowIndex: 0,
      amount: 260,
      postedAt: "2026-06-20",
      counterparty: cp,
      isHold: false,
      selectedCategoryId: categoryId,
    });

    const { error } = await commit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    const row = await ctx.admin
      .from("transaction_import_rows")
      .select("decision")
      .eq("id", rowId)
      .single();
    expect(row.error).toBeNull();
    // A new tx was inserted, leaving the row decision as 'import'.
    expect(row.data?.decision).toBe("import");

    // Held tx untouched.
    const tx = await ctx.admin.from("transactions").select("amount").eq("id", txId).single();
    expect(Number(tx.data?.amount)).toBe(200);

    // Hold link still set.
    const link = await ctx.admin
      .from("transaction_import_links")
      .select("is_hold")
      .eq("transaction_id", txId)
      .single();
    expect(link.data?.is_hold).toBe(true);

    // Two transactions now exist for this user (hold + new settle).
    const all = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("description", `${SENTINEL}%`);
    expect(all.data?.length).toBe(2);
  });

  it("does NOT fold a non-hold same-merchant different-amount row", async () => {
    const cp = `${SENTINEL} HYPEROIL`;
    // Commit a NORMAL expense (link is_hold = false).
    const { txId } = await commitHold({
      counterparty: cp,
      amount: 200,
      postedAt: "2026-06-19",
      isHold: false,
    });

    // Same merchant, 150 within 3 days -> tolerant path is gated on is_hold,
    // so this must stay decision='import' (a new tx is inserted).
    const categoryId = await seedCategory();
    const seed = await seedSession();
    const rowId = await insertRow(seed, {
      rowIndex: 0,
      amount: 150,
      postedAt: "2026-06-20",
      counterparty: cp,
      isHold: false,
      selectedCategoryId: categoryId,
    });

    const { error } = await commit(ctx.userA.client, seed.sessionId);
    expect(error).toBeNull();

    const row = await ctx.admin
      .from("transaction_import_rows")
      .select("decision")
      .eq("id", rowId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data?.decision).toBe("import");

    const tx = await ctx.admin.from("transactions").select("amount").eq("id", txId).single();
    expect(Number(tx.data?.amount)).toBe(200);

    const all = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("description", `${SENTINEL}%`);
    expect(all.data?.length).toBe(2);
  });
});
