import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  createUserClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

type TxType = "expense" | "income";
type PlanKind = "save" | "debt";

describe("RPC: plan settlement", () => {
  let ctx: TestContext;
  let expenseCategoryAId: string;
  let incomeCategoryAId: string;
  let expenseCategoryBId: string;

  async function ensureCategory(userId: string, name: string, type: TxType): Promise<string> {
    const existing = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .eq("type", type)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data.id;

    const created = await ctx.admin
      .from("categories")
      .insert({ user_id: userId, name, type })
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id;
  }

  async function createPlan(
    userId: string,
    name: string,
    groupId: string | null = null,
    kind: PlanKind = "debt"
  ) {
    const { data, error } = await ctx.admin
      .from("plans")
      .insert({
        name: `${SENTINEL} ${name}`,
        user_id: userId,
        group_id: groupId,
        kind,
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        budget_amount: null,
        target_amount: kind === "save" ? 1000 : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function createTx(opts: {
    userId: string;
    description: string;
    type: TxType;
    categoryId: string;
    date?: string;
    groupId?: string | null;
  }) {
    const { data, error } = await ctx.admin
      .from("transactions")
      .insert({
        amount: opts.type === "income" ? 500 : 42,
        currency: "PLN",
        description: `${SENTINEL} ${opts.description}`,
        date: opts.date ?? "2026-06-02",
        type: opts.type,
        category_id: opts.categoryId,
        user_id: opts.userId,
        group_id: opts.groupId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    expenseCategoryAId = await ensureCategory(
      ctx.userA.userId,
      "RLS plan settlement expense A",
      "expense"
    );
    incomeCategoryAId = await ensureCategory(
      ctx.userA.userId,
      "RLS plan settlement income A",
      "income"
    );
    expenseCategoryBId = await ensureCategory(
      ctx.userB.userId,
      "RLS plan settlement expense B",
      "expense"
    );
  });

  beforeEach(async () => {
    await cleanupSentinels(ctx.admin);
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("links and unlinks an expense transaction to a private plan for the owner", async () => {
    const planId = await createPlan(ctx.userA.userId, "expense plan");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "expense",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const { data: link, error: linkError } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linkError).toBeNull();
    expect(link?.plan_id).toBe(planId);
    expect(link?.transaction_id).toBe(txId);

    const { error: unlinkError } = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlinkError).toBeNull();
  });

  it("links expense contributions to saving goals", async () => {
    const planId = await createPlan(ctx.userA.userId, "contribution plan", null, "save");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "contribution",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const { data, error } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).toBeNull();
    expect(data?.transaction_id).toBe(txId);
  });

  it("rejects income settlement for both plan kinds", async () => {
    const savePlanId = await createPlan(ctx.userA.userId, "save type policy", null, "save");
    const debtPlanId = await createPlan(ctx.userA.userId, "debt type policy", null, "debt");
    const incomeTxId = await createTx({
      userId: ctx.userA.userId,
      description: "debt wrong type income",
      type: "income",
      categoryId: incomeCategoryAId,
    });

    const saveResult = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: savePlanId,
      p_transaction_id: incomeTxId,
    });
    expect(saveResult.error).not.toBeNull();
    expect(saveResult.error?.message ?? "").toMatch(/transaction_must_be_expense/);

    const debtResult = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: debtPlanId,
      p_transaction_id: incomeTxId,
    });
    expect(debtResult.error).not.toBeNull();
    expect(debtResult.error?.message ?? "").toMatch(/transaction_must_be_expense/);
  });

  it("locks a linked transaction to expense until it is unlinked", async () => {
    const planId = await createPlan(ctx.userA.userId, "type lock", null, "save");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "locked contribution",
      type: "expense",
      categoryId: expenseCategoryAId,
    });
    const link = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(link.error).toBeNull();

    const locked = await ctx.admin.from("transactions").update({ type: "income" }).eq("id", txId);
    expect(locked.error?.message).toContain("transaction_type_locked_by_plan_link");

    const unlink = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlink.error).toBeNull();
    const unlocked = await ctx.admin
      .from("transactions")
      .update({ type: "income", category_id: incomeCategoryAId })
      .eq("id", txId);
    expect(unlocked.error).toBeNull();
  });

  it("adds and links a paid Cele contribution atomically", async () => {
    const planId = await createPlan(ctx.userA.userId, "atomic contribution", null, "save");
    const result = await ctx.userA.client.rpc("add_plan_contribution", {
      p_plan_id: planId,
      p_amount: 275,
      p_date: "2026-06-12",
      p_description: "Fundusz wakacyjny",
    });
    expect(result.error).toBeNull();

    const tx = await ctx.admin
      .from("transactions")
      .select("id, amount, type, status, group_id, category_id, categories(name)")
      .eq("id", result.data)
      .single();
    expect(tx.error).toBeNull();
    expect(tx.data).toMatchObject({ amount: 275, type: "expense", status: "paid", group_id: null });
    expect(tx.data?.categories).toMatchObject({ name: "Cele" });

    const link = await ctx.admin
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .eq("plan_id", planId)
      .eq("transaction_id", result.data)
      .single();
    expect(link.error).toBeNull();
  });

  it("corrects save progress without creating a cash transaction", async () => {
    const planId = await createPlan(ctx.userA.userId, "manual progress correction", null, "save");
    const before = await ctx.admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userA.userId);

    const first = await ctx.userA.client.rpc("set_save_plan_progress", {
      p_plan_id: planId,
      p_saved_amount: 250,
      p_effective_date: "2026-06-12",
      p_note: "Stan początkowy",
    });
    expect(first.error).toBeNull();

    const second = await ctx.userA.client.rpc("set_save_plan_progress", {
      p_plan_id: planId,
      p_saved_amount: 100,
      p_effective_date: "2026-06-12",
      p_note: "Korekta",
    });
    expect(second.error).toBeNull();

    const snapshots = await ctx.userA.client
      .from("plan_progress_snapshots")
      .select("saved_amount, note")
      .eq("plan_id", planId)
      .order("created_at");
    expect(snapshots.error).toBeNull();
    expect(snapshots.data?.map((row) => row.saved_amount)).toEqual([250, 100]);

    const latest = await ctx.userA.client
      .from("plan_progress_snapshots")
      .select("id, saved_amount")
      .eq("plan_id", planId)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(latest.error).toBeNull();
    expect(latest.data?.id).toBe(second.data);
    expect(latest.data?.saved_amount).toBe(100);

    const after = await ctx.admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userA.userId);
    expect(after.count).toBe(before.count);

    const directWrite = await ctx.userA.client.from("plan_progress_snapshots").insert({
      plan_id: planId,
      saved_amount: 999,
      effective_date: "2026-06-14",
    });
    expect(directWrite.error).not.toBeNull();
  });

  it("hides and rejects private progress corrections from another user", async () => {
    const planId = await createPlan(ctx.userA.userId, "private progress correction", null, "save");
    const ownerResult = await ctx.userA.client.rpc("set_save_plan_progress", {
      p_plan_id: planId,
      p_saved_amount: 300,
      p_effective_date: "2026-06-12",
    });
    expect(ownerResult.error).toBeNull();

    const visibleToOther = await ctx.userB.client
      .from("plan_progress_snapshots")
      .select("id")
      .eq("plan_id", planId);
    expect(visibleToOther.error).toBeNull();
    expect(visibleToOther.data).toEqual([]);

    const forbidden = await ctx.userB.client.rpc("set_save_plan_progress", {
      p_plan_id: planId,
      p_saved_amount: 500,
      p_effective_date: "2026-06-12",
    });
    expect(forbidden.error).not.toBeNull();
    expect(forbidden.error?.message ?? "").toMatch(/not_authorized_plan/);
  });

  it("allows shared progress correction only after a member becomes co-owner", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} progress-correction-group`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    if (member.error) throw member.error;

    const planId = await createPlan(
      ctx.userA.userId,
      "shared progress correction",
      groupId,
      "save"
    );
    const forbidden = await ctx.userB.client.rpc("set_save_plan_progress", {
      p_plan_id: planId,
      p_saved_amount: 400,
      p_effective_date: "2026-06-12",
    });
    expect(forbidden.error?.message ?? "").toMatch(/not_authorized_plan/);

    const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: ctx.userB.userId,
    });
    expect(nominate.error).toBeNull();

    const allowed = await ctx.userB.client.rpc("set_save_plan_progress", {
      p_plan_id: planId,
      p_saved_amount: 400,
      p_effective_date: "2026-06-12",
    });
    expect(allowed.error).toBeNull();

    const visible = await ctx.userB.client
      .from("plan_progress_snapshots")
      .select("saved_amount")
      .eq("plan_id", planId);
    expect(visible.error).toBeNull();
    expect(visible.data?.map((row) => row.saved_amount)).toEqual([400]);
  });

  it("deletes private data but preserves group-owned financial history", async () => {
    const password = process.env.RLS_TEST_PASSWORD;
    if (!password) throw new Error("RLS_TEST_PASSWORD is required");

    const email = `rls-delete-${crypto.randomUUID()}@rls.test`;
    const createdUser = await ctx.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createdUser.error || !createdUser.data.user) {
      throw createdUser.error ?? new Error("temporary user was not created");
    }
    const temporaryUserId = createdUser.data.user.id;
    let groupId: string | null = null;
    let importAccountId: string | null = null;
    let importSessionId: string | null = null;

    try {
      const signedIn = await createAnonClient().auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) {
        throw signedIn.error ?? new Error("temporary user did not receive a session");
      }
      const temporaryClient = createUserClient(signedIn.data.session.access_token);

      const groupResult = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} account-deletion-group`,
      });
      if (groupResult.error || !groupResult.data) {
        throw groupResult.error ?? new Error("group was not created");
      }
      groupId = (groupResult.data as { id: string }).id;

      const membership = await ctx.admin.from("group_members").insert({
        group_id: groupId,
        user_id: temporaryUserId,
      });
      if (membership.error) throw membership.error;

      const coOwner = await ctx.userA.client.rpc("nominate_group_co_owner", {
        p_group_id: groupId,
        p_user_id: temporaryUserId,
      });
      if (coOwner.error) throw coOwner.error;

      const temporaryCategoryId = await ensureCategory(
        temporaryUserId,
        `${SENTINEL} departing member category`,
        "expense"
      );

      const planId = await createPlan(temporaryUserId, "surviving shared plan", groupId, "save");
      const planCategory = await ctx.admin
        .from("plans")
        .update({ category_id: temporaryCategoryId })
        .eq("id", planId);
      if (planCategory.error) throw planCategory.error;

      const transactionId = await createTx({
        userId: temporaryUserId,
        description: "surviving shared contribution",
        type: "expense",
        categoryId: temporaryCategoryId,
        groupId,
      });
      const privatePlanId = await createPlan(temporaryUserId, "deleted private plan");
      const privateTransactionId = await createTx({
        userId: temporaryUserId,
        description: "deleted private transaction",
        type: "expense",
        categoryId: temporaryCategoryId,
      });

      const link = await temporaryClient.rpc("link_plan_transaction", {
        p_plan_id: planId,
        p_transaction_id: transactionId,
      });
      expect(link.error).toBeNull();

      const snapshot = await temporaryClient.rpc("set_save_plan_progress", {
        p_plan_id: planId,
        p_saved_amount: 250,
        p_effective_date: "2026-06-12",
      });
      expect(snapshot.error).toBeNull();

      const recurringSkip = await ctx.admin
        .from("recurring_occurrence_skips")
        .insert({
          user_id: temporaryUserId,
          group_id: groupId,
          recurring_template_id: transactionId,
          occurrence_date: "2026-06-19",
          created_by: temporaryUserId,
        })
        .select("id")
        .single();
      if (recurringSkip.error) throw recurringSkip.error;

      const bankAccount = await ctx.admin
        .from("bank_accounts")
        .insert({
          user_id: temporaryUserId,
          kind: "ing",
          label: `${SENTINEL} departing member import`,
        })
        .select("id")
        .single();
      if (bankAccount.error) throw bankAccount.error;
      importAccountId = bankAccount.data.id;

      const importSession = await ctx.admin
        .from("transaction_import_sessions")
        .insert({
          user_id: temporaryUserId,
          bank_account_id: importAccountId,
          source_file_hash: `hash-${SENTINEL}-account-deletion`,
          detected_kind: "ing",
        })
        .select("id")
        .single();
      if (importSession.error) throw importSession.error;
      importSessionId = importSession.data.id;

      const importRow = await ctx.admin
        .from("transaction_import_rows")
        .insert({
          session_id: importSessionId,
          row_index: 0,
          posted_at: "2026-06-02",
          amount: 42,
          type: "expense",
          description: `${SENTINEL} departing member import row`,
          currency: "PLN",
          raw_row_hash: `row-${SENTINEL}-account-deletion`,
          transaction_id: transactionId,
        })
        .select("id")
        .single();
      if (importRow.error) throw importRow.error;

      const importLink = await ctx.admin.from("transaction_import_links").insert({
        transaction_id: transactionId,
        user_id: temporaryUserId,
        bank_account_id: importAccountId,
        session_id: importSessionId,
        row_id: importRow.data.id,
        source_file_hash: `hash-${SENTINEL}-account-deletion`,
        source_row_index: 0,
        fingerprint: `fingerprint-${SENTINEL}-account-deletion`,
      });
      if (importLink.error) throw importLink.error;

      const deletion = await temporaryClient.rpc("delete_account");
      expect(deletion.error).toBeNull();

      const survivingPlan = await ctx.admin
        .from("plans")
        .select("user_id, group_id, category_id")
        .eq("id", planId)
        .single();
      expect(survivingPlan.error).toBeNull();
      expect(survivingPlan.data).toMatchObject({
        user_id: ctx.userA.userId,
        group_id: groupId,
      });

      const survivingTransaction = await ctx.admin
        .from("transactions")
        .select("user_id, group_id, category_id")
        .eq("id", transactionId)
        .single();
      expect(survivingTransaction.error).toBeNull();
      expect(survivingTransaction.data).toMatchObject({
        user_id: ctx.userA.userId,
        group_id: groupId,
      });
      expect(survivingTransaction.data?.category_id).toBe(survivingPlan.data?.category_id);

      const transferredCategory = await ctx.admin
        .from("categories")
        .select("user_id, name")
        .eq("id", survivingTransaction.data?.category_id ?? "")
        .single();
      expect(transferredCategory.error).toBeNull();
      expect(transferredCategory.data).toMatchObject({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} departing member category`,
      });

      const deletedPrivateRows = await Promise.all([
        ctx.admin.from("plans").select("id").eq("id", privatePlanId),
        ctx.admin.from("transactions").select("id").eq("id", privateTransactionId),
      ]);
      expect(deletedPrivateRows.every((result) => !result.error && result.data?.length === 0)).toBe(
        true
      );

      const survivingLink = await ctx.admin
        .from("plan_transaction_links")
        .select("created_by")
        .eq("plan_id", planId)
        .single();
      expect(survivingLink.error).toBeNull();
      expect(survivingLink.data?.created_by).toBeNull();

      const survivingSnapshot = await ctx.admin
        .from("plan_progress_snapshots")
        .select("created_by")
        .eq("plan_id", planId)
        .single();
      expect(survivingSnapshot.error).toBeNull();
      expect(survivingSnapshot.data?.created_by).toBeNull();

      const survivingSkip = await ctx.admin
        .from("recurring_occurrence_skips")
        .select("user_id, group_id, created_by")
        .eq("id", recurringSkip.data.id)
        .single();
      expect(survivingSkip.error).toBeNull();
      expect(survivingSkip.data).toMatchObject({
        user_id: ctx.userA.userId,
        group_id: groupId,
        created_by: null,
      });

      const erasedPrivateData = await Promise.all([
        ctx.admin
          .from("transaction_import_links")
          .select("transaction_id")
          .eq("transaction_id", transactionId),
        ctx.admin.from("transaction_import_rows").select("id").eq("session_id", importSessionId),
        ctx.admin.from("transaction_import_sessions").select("id").eq("id", importSessionId),
        ctx.admin.from("bank_accounts").select("id").eq("id", importAccountId),
        ctx.admin.from("group_members").select("user_id").eq("user_id", temporaryUserId),
        ctx.admin.from("categories").select("id").eq("id", temporaryCategoryId),
      ]);
      expect(erasedPrivateData.every((result) => !result.error && result.data?.length === 0)).toBe(
        true
      );

      const deletedUser = await ctx.admin.auth.admin.getUserById(temporaryUserId);
      expect(deletedUser.data.user).toBeNull();
    } finally {
      if (importSessionId) {
        await ctx.admin.from("transaction_import_links").delete().eq("session_id", importSessionId);
        await ctx.admin.from("transaction_import_rows").delete().eq("session_id", importSessionId);
        await ctx.admin.from("transaction_import_sessions").delete().eq("id", importSessionId);
      }
      if (importAccountId) await ctx.admin.from("bank_accounts").delete().eq("id", importAccountId);
      if (groupId) await ctx.admin.from("user_groups").delete().eq("id", groupId);
      await ctx.admin.auth.admin.deleteUser(temporaryUserId);
    }
  });

  it("rejects transactions outside the plan period", async () => {
    const planId = await createPlan(ctx.userA.userId, "period plan");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "outside period",
      type: "expense",
      categoryId: expenseCategoryAId,
      date: "2026-07-02",
    });

    const { error } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/transaction_outside_plan_period/);
  });

  it("blocks user B from linking to user A private plan", async () => {
    const planId = await createPlan(ctx.userA.userId, "private plan");
    const txId = await createTx({
      userId: ctx.userB.userId,
      description: "b tx",
      type: "expense",
      categoryId: expenseCategoryBId,
    });

    const { error } = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).not.toBeNull();
  });

  it("allows group member to link group transaction to shared plan", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} settlement-group`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const member = await ctx.admin.from("group_members").insert({
      group_id: groupId,
      user_id: ctx.userB.userId,
    });
    if (member.error) throw member.error;

    const planId = await createPlan(ctx.userA.userId, "shared settle", groupId);
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "shared expense",
      type: "expense",
      categoryId: expenseCategoryAId,
      groupId,
    });

    const { data: link, error: linkError } = await ctx.userB.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linkError).toBeNull();
    expect(link?.plan_id).toBe(planId);

    const { error: unlinkError } = await ctx.userB.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlinkError).toBeNull();
  });

  it("rejects private plan to group transaction scope mismatch", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} settlement-scope`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const planId = await createPlan(ctx.userA.userId, "private scope");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "group tx",
      type: "expense",
      categoryId: expenseCategoryAId,
      groupId,
    });

    const { error } = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/private_scope_mismatch/);
  });

  it("rejects linking one transaction to two plans", async () => {
    const planAId = await createPlan(ctx.userA.userId, "one tx A");
    const planBId = await createPlan(ctx.userA.userId, "one tx B");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "one tx",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const first = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planAId,
      p_transaction_id: txId,
    });
    expect(first.error).toBeNull();

    const second = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planBId,
      p_transaction_id: txId,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? "").toMatch(/transaction_already_linked/);
  });

  it("denies anon link_plan_transaction", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("link_plan_transaction", {
      p_plan_id: "00000000-0000-4000-8000-000000000001",
      p_transaction_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(error).not.toBeNull();
  });

  it("denies anon unlink_plan_transaction", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("unlink_plan_transaction", {
      p_plan_id: "00000000-0000-4000-8000-000000000001",
      p_transaction_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(error).not.toBeNull();
  });

  it("rejects linking and contributions on refinanced/closed plans", async () => {
    const refinancedId = await createPlan(ctx.userA.userId, "refinanced link");
    const closedId = await createPlan(ctx.userA.userId, "closed link");
    const saveClosedId = await createPlan(ctx.userA.userId, "closed save", null, "save");
    await ctx.admin.from("plans").update({ status: "refinanced" }).eq("id", refinancedId);
    await ctx.admin.from("plans").update({ status: "closed" }).eq("id", closedId);
    await ctx.admin.from("plans").update({ status: "closed" }).eq("id", saveClosedId);

    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "post-close attempt",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const refinanced = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: refinancedId,
      p_transaction_id: txId,
    });
    expect(refinanced.error).not.toBeNull();
    expect(refinanced.error?.message ?? "").toMatch(/plan_not_active/);

    const closed = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: closedId,
      p_transaction_id: txId,
    });
    expect(closed.error).not.toBeNull();
    expect(closed.error?.message ?? "").toMatch(/plan_not_active/);

    const contribution = await ctx.userA.client.rpc("add_plan_contribution", {
      p_plan_id: saveClosedId,
      p_amount: 50,
      p_date: "2026-06-12",
    });
    expect(contribution.error).not.toBeNull();
    expect(contribution.error?.message ?? "").toMatch(/plan_not_active/);
  });

  it("keeps historical links on closed plans but still allows unlink", async () => {
    const planId = await createPlan(ctx.userA.userId, "close after link");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "linked then closed",
      type: "expense",
      categoryId: expenseCategoryAId,
    });

    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linked.error).toBeNull();

    await ctx.admin.from("plans").update({ status: "closed" }).eq("id", planId);

    const stillLinked = await ctx.admin
      .from("plan_transaction_links")
      .select("transaction_id")
      .eq("plan_id", planId)
      .eq("transaction_id", txId)
      .maybeSingle();
    expect(stillLinked.error).toBeNull();
    expect(stillLinked.data?.transaction_id).toBe(txId);

    const unlink = await ctx.userA.client.rpc("unlink_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(unlink.error).toBeNull();
  });

  it("rejects post-link date and group_id edits that break plan invariants", async () => {
    const { data: group, error: groupError } = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} linked-lock-group`,
    });
    if (groupError || !group) throw groupError ?? new Error("no group");
    const groupId = (group as { id: string }).id;

    const planId = await createPlan(ctx.userA.userId, "linked lock");
    const txId = await createTx({
      userId: ctx.userA.userId,
      description: "linked lock tx",
      type: "expense",
      categoryId: expenseCategoryAId,
      date: "2026-06-10",
    });

    const linked = await ctx.userA.client.rpc("link_plan_transaction", {
      p_plan_id: planId,
      p_transaction_id: txId,
    });
    expect(linked.error).toBeNull();

    const outsidePeriod = await ctx.userA.client
      .from("transactions")
      .update({ date: "2026-07-15" })
      .eq("id", txId);
    expect(outsidePeriod.error).not.toBeNull();
    expect(outsidePeriod.error?.message ?? "").toMatch(/transaction_outside_plan_period/);

    const scopeDrift = await ctx.userA.client
      .from("transactions")
      .update({ group_id: groupId })
      .eq("id", txId);
    expect(scopeDrift.error).not.toBeNull();
    expect(scopeDrift.error?.message ?? "").toMatch(/private_scope_mismatch/);

    const okDate = await ctx.userA.client
      .from("transactions")
      .update({ date: "2026-06-20" })
      .eq("id", txId);
    expect(okDate.error).toBeNull();
  });
});
