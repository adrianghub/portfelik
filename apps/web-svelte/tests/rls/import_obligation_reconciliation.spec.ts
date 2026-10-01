import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("commit_import_session obligation reconciliation", () => {
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

  async function seedCategory(): Promise<string> {
    const category = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} reconcile category`,
        type: "expense",
      })
      .select("id")
      .single();
    if (category.error) throw category.error;
    return category.data.id;
  }

  async function seedManualExpense(
    categoryId: string,
    status: "upcoming" | "overdue" | "paid"
  ): Promise<string> {
    const transaction = await ctx.admin
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        category_id: categoryId,
        amount: 35,
        currency: "PLN",
        type: "expense",
        status,
        date: "2026-09-13",
        description: `${SENTINEL} Orange Flex`,
      })
      .select("id")
      .single();
    if (transaction.error) throw transaction.error;
    return transaction.data.id;
  }

  async function seedAccount(kind = "ing"): Promise<string> {
    const account = await ctx.admin
      .from("bank_accounts")
      .insert({
        user_id: ctx.userA.userId,
        kind,
        label: `${SENTINEL} reconcile account`,
      })
      .select("id")
      .single();
    if (account.error) throw account.error;
    return account.data.id;
  }

  async function seedSession(accountId: string, suffix: string, kind = "ing"): Promise<string> {
    const session = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: accountId,
        source_file_hash: `hash-${SENTINEL}-reconcile-${suffix}`,
        detected_kind: kind,
        status: "preview",
      })
      .select("id")
      .single();
    if (session.error) throw session.error;
    return session.data.id;
  }

  async function seedImportRow(
    sessionId: string,
    suffix: string,
    postedAt: string
  ): Promise<string> {
    const row = await ctx.admin
      .from("transaction_import_rows")
      .insert({
        session_id: sessionId,
        row_index: 0,
        posted_at: postedAt,
        amount: 35,
        currency: "PLN",
        type: "expense",
        description: `${SENTINEL} ORANGE POLSKA S.A.`,
        counterparty: "Orange Polska",
        external_id: `${SENTINEL}-orange-${suffix}`,
        raw_row_hash: `raw-${SENTINEL}-reconcile-${suffix}`,
        decision: "import",
      })
      .select("id")
      .single();
    if (row.error) throw row.error;
    return row.data.id;
  }

  async function markSession(sessionId: string) {
    const marked = await ctx.userA.client.rpc("mark_preview_duplicates", {
      p_session_id: sessionId,
    });
    expect(marked.error).toBeNull();
    return marked.data;
  }

  async function commitSession(sessionId: string) {
    const committed = await ctx.userA.client.rpc("commit_import_session", {
      p_session_id: sessionId,
    });
    expect(committed.error).toBeNull();
    return committed.data as { inserted: number };
  }

  async function markAndCommit(sessionId: string) {
    await markSession(sessionId);
    return commitSession(sessionId);
  }

  it("reconciles mBank card-purchase boilerplate without matching a different merchant", async () => {
    const categoryId = await seedCategory();
    const targetId = await seedManualExpense(categoryId, "paid");
    const accountId = await seedAccount("mbank");
    const sessionId = await seedSession(accountId, "mbank-boilerplate", "mbank");
    const rowId = await seedImportRow(sessionId, "mbank-boilerplate", "2026-09-13");
    const edited = await ctx.admin
      .from("transaction_import_rows")
      .update({
        description: `${SENTINEL} ZAKUP TOWARÓW I USŁUG Orange Flex`,
        counterparty: "Orange Polska",
      })
      .eq("id", rowId);
    expect(edited.error).toBeNull();
    // The Orange target is still unlinked here: a different merchant must not
    // reconcile just because the boilerplate, amount and date are identical.
    const otherSession = await seedSession(accountId, "mbank-other-merchant", "mbank");
    const otherRow = await seedImportRow(otherSession, "mbank-other-merchant", "2026-09-13");
    const changed = await ctx.admin
      .from("transaction_import_rows")
      .update({
        description: `${SENTINEL} ZAKUP TOWARÓW I USŁUG Energa Polska`,
        counterparty: "Energa Polska",
      })
      .eq("id", otherRow);
    expect(changed.error).toBeNull();
    expect((await markAndCommit(otherSession)).inserted).toBe(1);

    expect((await markAndCommit(sessionId)).inserted).toBe(0);
    const link = await ctx.userA.client
      .from("transaction_import_links")
      .select("transaction_id")
      .eq("row_id", rowId)
      .single();
    expect(link.error).toBeNull();
    expect(link.data?.transaction_id).toBe(targetId);
  });

  async function seedPlanLinkedExpense(options: {
    categoryId: string;
    description: string;
    date: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ planId: string; transactionId: string }> {
    const plan = await ctx.admin
      .from("plans")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} reconcile plan ${options.description}`,
        category_id: options.categoryId,
        kind: "debt",
        budget_amount: null,
        target_amount: null,
        start_date: options.startDate ?? "2026-09-01",
        end_date: options.endDate ?? "2026-09-30",
        group_id: null,
      })
      .select("id")
      .single();
    if (plan.error) throw plan.error;

    const transaction = await ctx.admin
      .from("transactions")
      .insert({
        user_id: ctx.userA.userId,
        category_id: options.categoryId,
        amount: 35,
        currency: "PLN",
        type: "expense",
        status: "upcoming",
        date: options.date,
        description: options.description,
      })
      .select("id")
      .single();
    if (transaction.error) throw transaction.error;

    const link = await ctx.admin.from("plan_transaction_links").insert({
      plan_id: plan.data.id,
      transaction_id: transaction.data.id,
      created_by: ctx.userA.userId,
    });
    if (link.error) throw link.error;
    return { planId: plan.data.id, transactionId: transaction.data.id };
  }

  it.each(["upcoming", "overdue"] as const)(
    "reconciles a matching %s obligation into paid bank history",
    async (status) => {
      const categoryId = await seedCategory();
      const transactionId = await seedManualExpense(categoryId, status);
      const accountId = await seedAccount();
      const sessionId = await seedSession(accountId, status);
      const rowId = await seedImportRow(sessionId, status, "2026-09-14");

      const result = await markAndCommit(sessionId);
      expect(result).toMatchObject({ inserted: 0 });

      const transaction = await ctx.admin
        .from("transactions")
        .select("status, date, description, counterparty")
        .eq("id", transactionId)
        .single();
      expect(transaction.error).toBeNull();
      expect(transaction.data).toMatchObject({
        status: "paid",
        description: `${SENTINEL} Orange Flex`,
        counterparty: "Orange Polska",
      });
      expect(String(transaction.data?.date).startsWith("2026-09-14")).toBe(true);

      const row = await ctx.admin
        .from("transaction_import_rows")
        .select("decision, duplicate_of, transaction_id")
        .eq("id", rowId)
        .single();
      expect(row.data).toMatchObject({
        decision: "duplicate",
        duplicate_of: transactionId,
        transaction_id: transactionId,
      });

      const link = await ctx.admin
        .from("transaction_import_links")
        .select("transaction_id, session_id, row_id, external_transaction_id, fingerprint")
        .eq("transaction_id", transactionId)
        .single();
      expect(link.error).toBeNull();
      expect(link.data).toMatchObject({
        transaction_id: transactionId,
        session_id: sessionId,
        row_id: rowId,
        external_transaction_id: `${SENTINEL}-orange-${status}`,
      });
      expect(link.data?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  );

  it("attaches durable import provenance to an already-paid manual expense", async () => {
    const categoryId = await seedCategory();
    const transactionId = await seedManualExpense(categoryId, "paid");
    const accountId = await seedAccount();
    const sessionId = await seedSession(accountId, "paid");
    await seedImportRow(sessionId, "paid", "2026-09-14");

    const result = await markAndCommit(sessionId);
    expect(result).toMatchObject({ inserted: 0 });

    const links = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id")
      .eq("transaction_id", transactionId);
    expect(links.error).toBeNull();
    expect(links.data).toEqual([{ transaction_id: transactionId }]);

    const transactions = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("description", `${SENTINEL} Orange Flex`);
    expect(transactions.error).toBeNull();
    expect(transactions.data).toEqual([{ id: transactionId }]);
  });

  it("serializes preview marking with commit without losing the bank row", async () => {
    const categoryId = await seedCategory();
    await seedManualExpense(categoryId, "upcoming");
    const accountId = await seedAccount();
    const sessionId = await seedSession(accountId, "concurrent-mark-commit");
    const rowId = await seedImportRow(sessionId, "concurrent-mark-commit", "2026-09-14");

    const [marked, committed] = await Promise.all([
      ctx.userA.client.rpc("mark_preview_duplicates", { p_session_id: sessionId }),
      ctx.userA.client.rpc("commit_import_session", { p_session_id: sessionId }),
    ]);
    expect(committed.error).toBeNull();
    if (marked.error) expect(marked.error.message).toContain("session_not_in_preview_state");

    const links = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id, row_id")
      .eq("session_id", sessionId);
    expect(links.error).toBeNull();
    expect(links.data).toHaveLength(1);
    expect(links.data?.[0].row_id).toBe(rowId);
  });

  it("reconciles a matching plan installment and preserves its link", async () => {
    const categoryId = await seedCategory();
    const { transactionId, planId } = await seedPlanLinkedExpense({
      categoryId,
      description: `${SENTINEL} Orange Flex`,
      date: "2026-09-13",
    });
    const accountId = await seedAccount();
    const sessionId = await seedSession(accountId, "plan-positive");
    await seedImportRow(sessionId, "plan-positive", "2026-09-14");
    expect(await markAndCommit(sessionId)).toMatchObject({ inserted: 0 });

    const target = await ctx.admin
      .from("transactions")
      .select("status, date")
      .eq("id", transactionId)
      .single();
    expect(target.error).toBeNull();
    expect(target.data?.status).toBe("paid");
    expect(String(target.data?.date).startsWith("2026-09-14")).toBe(true);
    const link = await ctx.admin
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .eq("transaction_id", transactionId)
      .single();
    expect(link.error).toBeNull();
    expect(link.data).toMatchObject({ plan_id: planId, transaction_id: transactionId });
  });

  it("imports a distinct later bank charge instead of swallowing it into the reconciled obligation", async () => {
    const categoryId = await seedCategory();
    const transactionId = await seedManualExpense(categoryId, "upcoming");
    const accountId = await seedAccount();

    const firstSessionId = await seedSession(accountId, "first");
    const firstRowId = await seedImportRow(firstSessionId, "first", "2026-09-14");
    const secondSessionId = await seedSession(accountId, "second");
    const secondRowId = await seedImportRow(secondSessionId, "second", "2026-09-15");

    // Both previews are stale in exactly the way two browser tabs can be:
    // each claims the same obligation before either commit records provenance.
    await markSession(firstSessionId);
    await markSession(secondSessionId);

    const firstResult = await commitSession(firstSessionId);
    expect(firstResult).toMatchObject({ inserted: 0 });
    const secondResult = await commitSession(secondSessionId);
    expect(secondResult).toMatchObject({ inserted: 1 });

    const secondRow = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of, transaction_id")
      .eq("id", secondRowId)
      .single();
    expect(secondRow.data?.decision).toBe("import");
    expect(secondRow.data?.duplicate_of).toBeNull();
    expect(secondRow.data?.transaction_id).not.toBeNull();
    expect(secondRow.data?.transaction_id).not.toBe(transactionId);

    const links = await ctx.admin
      .from("transaction_import_links")
      .select("transaction_id, session_id, row_id")
      .in("session_id", [firstSessionId, secondSessionId])
      .order("session_id");
    expect(links.error).toBeNull();
    expect(links.data).toEqual(
      expect.arrayContaining([
        { transaction_id: transactionId, session_id: firstSessionId, row_id: firstRowId },
        {
          transaction_id: secondRow.data?.transaction_id,
          session_id: secondSessionId,
          row_id: secondRowId,
        },
      ])
    );

    const transactions = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .in("id", [transactionId, secondRow.data?.transaction_id]);
    expect(transactions.error).toBeNull();
    expect(transactions.data).toHaveLength(2);
  });

  it.each(["Netflix", "Energa Polska", "Płatność kartą Polska"])(
    "does not reconcile a plan installment with a different or generic payee: %s",
    async (payee) => {
      const categoryId = await seedCategory();
      const { transactionId } = await seedPlanLinkedExpense({
        categoryId,
        description: `${SENTINEL} ${payee}`,
        date: "2026-09-13",
      });
      const accountId = await seedAccount();
      const sessionId = await seedSession(accountId, "plan-payee-mismatch");
      const rowId = await seedImportRow(sessionId, "plan-payee-mismatch", "2026-09-14");

      await markSession(sessionId);
      const previewRow = await ctx.admin
        .from("transaction_import_rows")
        .select("decision, duplicate_of")
        .eq("id", rowId)
        .single();
      expect(previewRow.error).toBeNull();
      expect(previewRow.data).toMatchObject({ decision: "import", duplicate_of: null });

      expect(await commitSession(sessionId)).toMatchObject({ inserted: 1 });
      const target = await ctx.admin
        .from("transactions")
        .select("status, date")
        .eq("id", transactionId)
        .single();
      expect(target.data?.status).toBe("upcoming");
      expect(String(target.data?.date).startsWith("2026-09-13")).toBe(true);
    }
  );

  it("falls back to a normal import when a stale duplicate date is outside its plan", async () => {
    const categoryId = await seedCategory();
    const { transactionId } = await seedPlanLinkedExpense({
      categoryId,
      description: `${SENTINEL} Orange Polska`,
      date: "2026-09-30",
    });
    const accountId = await seedAccount();
    const sessionId = await seedSession(accountId, "plan-date-boundary");
    const rowId = await seedImportRow(sessionId, "plan-date-boundary", "2026-10-01");

    // Simulate an already-open preview made before the plan boundary changed.
    const staleDecision = await ctx.admin
      .from("transaction_import_rows")
      .update({ decision: "duplicate", duplicate_of: transactionId })
      .eq("id", rowId);
    if (staleDecision.error) throw staleDecision.error;

    expect(await commitSession(sessionId)).toMatchObject({ inserted: 1 });
    const target = await ctx.admin
      .from("transactions")
      .select("status, date")
      .eq("id", transactionId)
      .single();
    expect(target.data?.status).toBe("upcoming");
    expect(String(target.data?.date).startsWith("2026-09-30")).toBe(true);

    const row = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of, transaction_id")
      .eq("id", rowId)
      .single();
    expect(row.data?.decision).toBe("import");
    expect(row.data?.duplicate_of).toBeNull();
    expect(row.data?.transaction_id).not.toBeNull();
    expect(row.data?.transaction_id).not.toBe(transactionId);
  });

  it("does not let a regular group member reconcile another member's transaction", async () => {
    const group = await ctx.userB.client.rpc("create_group", {
      p_name: `${SENTINEL} reconcile regular-member group`,
    });
    if (group.error || !group.data) throw group.error ?? new Error("create_group returned no data");
    const groupId = (group.data as { id: string }).id;
    const membership = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userA.userId,
      role: "member",
    });
    if (membership.error) throw membership.error;

    const peerCategory = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userB.userId,
        name: `${SENTINEL} peer reconcile category`,
        type: "expense",
      })
      .select("id")
      .single();
    if (peerCategory.error) throw peerCategory.error;
    const peerTransaction = await ctx.admin
      .from("transactions")
      .insert({
        user_id: ctx.userB.userId,
        category_id: peerCategory.data.id,
        group_id: groupId,
        amount: 35,
        currency: "PLN",
        type: "expense",
        status: "upcoming",
        date: "2026-09-13",
        description: `${SENTINEL} Orange Polska`,
      })
      .select("id")
      .single();
    if (peerTransaction.error) throw peerTransaction.error;

    const accountId = await seedAccount();
    const sessionId = await seedSession(accountId, "regular-member");
    const rowId = await seedImportRow(sessionId, "regular-member", "2026-09-14");
    await markSession(sessionId);

    const previewRow = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of")
      .eq("id", rowId)
      .single();
    expect(previewRow.data).toMatchObject({ decision: "import", duplicate_of: null });
    expect(await commitSession(sessionId)).toMatchObject({ inserted: 1 });

    const target = await ctx.admin
      .from("transactions")
      .select("status, date")
      .eq("id", peerTransaction.data.id)
      .single();
    expect(target.data?.status).toBe("upcoming");
    expect(String(target.data?.date).startsWith("2026-09-13")).toBe(true);
  });

  it("keeps an exact re-import with the same bank identifier idempotent", async () => {
    const categoryId = await seedCategory();
    const transactionId = await seedManualExpense(categoryId, "upcoming");
    const accountId = await seedAccount();

    const firstSessionId = await seedSession(accountId, "exact-first");
    await seedImportRow(firstSessionId, "same-bank-id", "2026-09-14");
    expect(await markAndCommit(firstSessionId)).toMatchObject({ inserted: 0 });

    const secondSessionId = await seedSession(accountId, "exact-second");
    const secondRowId = await seedImportRow(secondSessionId, "same-bank-id", "2026-09-14");
    expect(await markAndCommit(secondSessionId)).toMatchObject({ inserted: 0 });

    const secondRow = await ctx.admin
      .from("transaction_import_rows")
      .select("decision, duplicate_of, transaction_id")
      .eq("id", secondRowId)
      .single();
    expect(secondRow.data).toMatchObject({
      decision: "duplicate",
      duplicate_of: transactionId,
      transaction_id: null,
    });

    const transactions = await ctx.admin
      .from("transactions")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .like("description", `${SENTINEL} Orange Flex`);
    expect(transactions.data).toEqual([{ id: transactionId }]);
  });

  it.each([false, true])(
    "preserves separate charges with the same bank identifier across accounts (stale preview: %s)",
    async (stalePreview) => {
      const categoryId = await seedCategory();
      const transactionId = await seedManualExpense(categoryId, "upcoming");
      const firstAccountId = await seedAccount();
      const secondAccountId = await seedAccount("mbank");
      const firstSessionId = await seedSession(firstAccountId, "account-first");
      const secondSessionId = await seedSession(secondAccountId, "account-second", "mbank");
      await seedImportRow(firstSessionId, "shared-bank-id", "2026-09-14");
      const secondRowId = await seedImportRow(secondSessionId, "shared-bank-id", "2026-09-14");

      await markSession(firstSessionId);
      if (stalePreview) await markSession(secondSessionId);
      expect(await commitSession(firstSessionId)).toMatchObject({ inserted: 0 });
      if (!stalePreview) await markSession(secondSessionId);
      expect(await commitSession(secondSessionId)).toMatchObject({ inserted: 1 });

      const row = await ctx.admin
        .from("transaction_import_rows")
        .select("decision, duplicate_of, transaction_id")
        .eq("id", secondRowId)
        .single();
      expect(row.error).toBeNull();
      expect(row.data?.decision).toBe("import");
      expect(row.data?.duplicate_of).toBeNull();
      expect(row.data?.transaction_id).not.toBeNull();
      expect(row.data?.transaction_id).not.toBe(transactionId);

      const links = await ctx.admin
        .from("transaction_import_links")
        .select("transaction_id, bank_account_id")
        .in("session_id", [firstSessionId, secondSessionId]);
      expect(links.error).toBeNull();
      expect(links.data).toHaveLength(2);
      expect(links.data).toEqual(
        expect.arrayContaining([
          { transaction_id: transactionId, bank_account_id: firstAccountId },
          { transaction_id: row.data?.transaction_id, bank_account_id: secondAccountId },
        ])
      );
    }
  );
});
