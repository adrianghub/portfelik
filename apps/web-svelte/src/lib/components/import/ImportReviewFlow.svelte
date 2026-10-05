<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { importActionLabel } from "$lib/content/import-copy";
  import DuplicateBanner from "$lib/components/import/DuplicateBanner.svelte";
  import ImportReviewCategorizeStep from "$lib/components/import/ImportReviewCategorizeStep.svelte";
  import ImportConfirmSheet from "$lib/components/import/ImportConfirmSheet.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { createCategory, fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    buildCategorizationRuleEditPatch,
    createCategorizationRule,
    deleteCategorizationRule,
    fetchCategorizationRules,
    updateCategorizationRule,
  } from "$lib/services/categorization-rules";
  import { areSimilarImportRows } from "$lib/import/similar-rows";
  import { matchCategory, suggestRuleFromRow } from "$lib/import/categorize";
  import { detectCategoryRuleSuggestions } from "$lib/import/category-rule-suggestions";
  import { fetchPlans } from "$lib/services/plans";
  import { resolveCeleCategoryId } from "$lib/services/goal-spending";
  import RuleCreateDialog from "$lib/components/settings/RuleCreateDialog.svelte";
  import type { CategorizationRuleInput } from "$lib/services/categorization-rules";
  import type { CategorizationRule, TransactionType } from "$lib/types";
  import { importAdapterLabel } from "$lib/import/banks/registry";
  import {
    filterImportRows,
    isImportRowFilterActive,
    EMPTY_IMPORT_ROW_FILTER,
    type ImportRowFilter,
  } from "$lib/import/filter-rows";
  import { summarizeImportReview } from "$lib/import/exception-rows";
  import type { ImportAdapterKind } from "$lib/import/banks/types";
  import {
    commitImportSession,
    fetchBankAccount,
    fetchSessionRows,
    previewFingerprintWarnings,
    statementSpanDays,
    updateRowDecision,
    type CommitResult,
    type ImportRow,
    type ImportSession,
    type RowDecision,
  } from "$lib/services/bank-import";
  import { fetchProfile } from "$lib/services/profiles";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import { importStoryAfterCommit, type ImportStoryLine } from "$lib/content/import-story";
  import { cn, formatCurrency } from "$lib/utils";
  import { session as authSession, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";

  interface Props {
    session: ImportSession;
    parseErrorCount?: number;
    skippedRowCount?: number;
    onCommitted: (
      result: CommitResult,
      dateRange?: ImportedDateRange,
      story?: string | null
    ) => void;
    onCancel: () => Promise<void> | void;
  }
  let {
    session,
    parseErrorCount = 0,
    skippedRowCount = 0,
    onCommitted,
    onCancel,
  }: Props = $props();

  interface ImportedDateRange {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }

  type FilterKind = "pending" | "all" | "uncategorized" | "income" | "expense";
  const MANUAL_RULE_PRIORITY = 10;

  const queryClient = useQueryClient();
  const uid = $derived(authSession.userId);
  const rowsKey = $derived(
    uid ? qk.importRows(uid, session.id) : ["user", "", "import-rows", session.id]
  );
  const rulesKey = $derived(
    uid ? qk.categorizationRules(uid) : ["user", "", "categorization_rules"]
  );

  let filter = $state<FilterKind>("all");
  let advancedFilter = $state<ImportRowFilter>({ ...EMPTY_IMPORT_ROW_FILTER });
  const advancedActive = $derived(isImportRowFilterActive(advancedFilter));
  function clearAdvancedFilter(): void {
    advancedFilter = { ...EMPTY_IMPORT_ROW_FILTER };
  }
  let confirmOpen = $state(false);
  let editRuleOpen = $state(false);
  let editingRule = $state<CategorizationRule | null>(null);
  let capturingRule = $state<{
    row: ImportRow;
    previousCategoryId: string | null;
    epoch?: number;
    signature?: string;
  } | null>(null);
  let editDescEnabled = $state(false);
  let editDesc = $state("");
  let editCounterpartyEnabled = $state(false);
  let editCounterparty = $state("");
  let editDateEnabled = $state(false);
  let editDayOfMonth = $state("1");
  let showAdvancedRuleOptions = $state(false);
  let editRuleSaving = $state(false);

  const editedRulePreview = $derived.by(() => {
    if (!editingRule) return null;
    const result = buildCategorizationRuleEditPatch(editingRule, {
      categoryId: editingRule.category_id,
      descEnabled: editDescEnabled,
      desc: editDesc,
      counterpartyEnabled: editCounterpartyEnabled,
      counterparty: editCounterparty,
      dateEnabled: editDateEnabled,
      dayOfMonth: editDayOfMonth,
    });
    return result.ok ? { ...editingRule, ...result.patch } : null;
  });

  const editRuleShowsText = $derived(editingRule?.kind !== "type");
  const editRuleTypeLabel = $derived(
    editingRule?.match_type === "income"
      ? m.common_income()
      : editingRule?.match_type === "expense"
        ? m.common_expense()
        : null
  );
  let createdRuleIds = $state<string[]>([]);

  let pendingCategoryReplacement = $state<
    Record<
      string,
      {
        previousCategoryId: string | null;
        previousRule: CategorizationRule | null;
      }
    >
  >({});

  interface RowCategoryAction {
    kind: "save" | "update";
    similarCount: number;
  }

  const rowsQuery = createQuery(() => ({
    queryKey: rowsKey,
    queryFn: () => fetchSessionRows(session.id),
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: uid ? qk.categories(uid) : ["user", "", "categories"],
    queryFn: fetchCategories,
    enabled: !!uid,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: uid ? qk.userGroups(uid) : ["user", "", "user_groups"],
    queryFn: fetchUserGroups,
    enabled: !!uid,
  }));

  const rulesQuery = createQuery(() => ({
    queryKey: rulesKey,
    queryFn: fetchCategorizationRules,
    enabled: !!uid,
  }));

  const savePlansQuery = createQuery(() => ({
    queryKey: uid ? [...qk.plans(uid), "save-hints"] : ["user", "", "plans", "save-hints"],
    queryFn: async () => {
      const plans = await fetchPlans();
      return plans.filter((p) => p.kind === "save").map((p) => ({ id: p.id, name: p.name }));
    },
    enabled: !!uid,
  }));

  const warningsQuery = createQuery(() => ({
    queryKey: uid
      ? qk.importPreviewWarnings(uid, session.id)
      : ["user", "", "import_preview_warnings", session.id],
    queryFn: () => previewFingerprintWarnings(session.id),
    enabled: !!uid,
  }));

  const accountQuery = createQuery(() => ({
    queryKey: uid
      ? qk.bankAccount(uid, session.bank_account_id)
      : ["user", "", "bank_account", session.bank_account_id],
    queryFn: () => fetchBankAccount(session.bank_account_id),
    enabled: !!uid,
  }));

  const profileQuery = createQuery(() => ({
    queryKey: uid ? qk.profile(uid) : ["user", "", "profile"],
    queryFn: () => fetchProfile(requireSessionUserId()),
    enabled: !!uid,
  }));

  const warningsByRow = $derived(new Map((warningsQuery.data ?? []).map((w) => [w.row_id, w])));
  const rows = $derived<ImportRow[]>(rowsQuery.data ?? []);

  // activeRows = rows the user is deciding on (not auto-skipped duplicates).
  const activeRows = $derived(rows.filter((r) => r.decision !== "duplicate"));
  const editedRuleMatches = $derived(
    editedRulePreview ? activeRows.filter((r) => rowMatchesRule(r, editedRulePreview)) : []
  );
  const importRows = $derived(rows.filter((r) => r.decision === "import"));

  function storyLines(source: ImportRow[]): ImportStoryLine[] {
    const categories = categoriesQuery.data ?? [];
    return source
      .filter((row) => row.decision === "import")
      .map((row) => ({
        type: row.type,
        amount: row.amount,
        categoryName: categories.find((c) => c.id === row.selected_category_id)?.name ?? null,
      }));
  }

  async function storyForCommit(result: CommitResult): Promise<string | null> {
    if (result.inserted === 0) return m.bank_commit_no_new();
    if (result.duplicates_commit > 0 || importRows.length === 0) {
      try {
        const fresh = await fetchSessionRows(session.id);
        return importStoryAfterCommit({
          duplicatesCommit: result.duplicates_commit,
          lines: storyLines(fresh),
          fromCommittedRows: true,
        });
      } catch {
        return null;
      }
    }
    return importStoryAfterCommit({
      duplicatesCommit: 0,
      lines: storyLines(importRows),
      fromCommittedRows: false,
    });
  }
  const skippedRows = $derived(rows.filter((r) => r.decision === "skip"));
  const duplicateRows = $derived(rows.filter((r) => r.decision === "duplicate"));
  function needsCategory(row: ImportRow): boolean {
    return (
      row.selected_category_id == null ||
      !!categoriesQuery.data?.find(
        (category) => category.id === row.selected_category_id && category.archived_at
      )
    );
  }
  const uncategorizedImportRows = $derived(importRows.filter(needsCategory));

  const filterCounts = $derived({
    pending: activeRows.filter((r) => r.decision === "pending").length,
    all: activeRows.length,
    uncategorized: activeRows.filter(needsCategory).length,
    income: activeRows.filter((r) => r.type === "income").length,
    expense: activeRows.filter((r) => r.type === "expense").length,
  });

  // Rule inspection: show exactly the rows a rule currently applies to (conditions
  // match AND the rule's category is selected) so a freshly captured rule can be audited.
  let inspectedRuleId = $state<string | null>(null);
  const inspectedRule = $derived(
    inspectedRuleId ? ((rulesQuery.data ?? []).find((r) => r.id === inspectedRuleId) ?? null) : null
  );
  const inspectedRuleRows = $derived(
    inspectedRule
      ? activeRows.filter(
          (r) =>
            r.selected_category_id === inspectedRule.category_id && rowMatchesRule(r, inspectedRule)
        )
      : []
  );

  const visibleRows = $derived.by(() => {
    if (inspectedRule) return inspectedRuleRows;
    let base: typeof activeRows;
    switch (filter) {
      case "pending":
        base = activeRows.filter((r) => r.decision === "pending");
        break;
      case "uncategorized":
        base = activeRows.filter(needsCategory);
        break;
      case "income":
        base = activeRows.filter((r) => r.type === "income");
        break;
      case "expense":
        base = activeRows.filter((r) => r.type === "expense");
        break;
      case "all":
      default:
        base = activeRows;
        break;
    }
    return advancedActive ? filterImportRows(base, advancedFilter) : base;
  });

  // Bulk actions are BOTH scoped to the current filter (visibleRows).
  const bulkImportableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision === "pending").length
  );
  const bulkRestorableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision === "skip").length
  );

  const inneRows = $derived(uncategorizedImportRows);
  const needsConfirm = $derived(inneRows.length > 0 || duplicateRows.length > 0);

  const celeCategoryId = $derived(
    resolveCeleCategoryId((categoriesQuery.data ?? []).filter((category) => !category.archived_at))
  );
  const savePlans = $derived(savePlansQuery.data ?? []);

  let dismissedRuleSuggestions = $state<Set<string>>(new Set());
  const categoryRuleSuggestions = $derived(
    detectCategoryRuleSuggestions(
      importRows.map((r) => ({
        type: r.type,
        description: r.edited_description ?? r.description,
        counterparty: r.counterparty,
        posted_at: r.posted_at,
        selected_category_id: r.selected_category_id,
      })),
      categoriesQuery.data ?? []
    ).filter((s) => !dismissedRuleSuggestions.has(s.signature))
  );
  const topRuleSuggestion = $derived(categoryRuleSuggestions[0] ?? null);

  async function acceptRuleSuggestion(
    suggestion: (typeof categoryRuleSuggestions)[number]
  ): Promise<void> {
    const row = importRows.find(
      (r) =>
        r.selected_category_id === suggestion.categoryId &&
        suggestRuleFromRow({ ...r, description: r.edited_description ?? r.description })
          ?.match_description === suggestion.text
    );
    if (row)
      capturingRule = {
        row,
        previousCategoryId: row.selected_category_id,
        signature: suggestion.signature,
      };
  }

  // Cadence nudge: when the statement spans more days than the user's import-reminder
  // cadence (default 14), suggest importing on that rhythm. Informational only - a hard
  // cap would block first-import history backfill.
  const reminderCadenceDays = $derived(
    profileQuery.data?.settings?.alerts?.bankImportReminder?.cadenceDays ?? 14
  );
  const statementSpan = $derived(statementSpanDays(rows));
  const spanNudge = $derived(
    statementSpan > reminderCadenceDays
      ? { spanDays: statementSpan, cadenceDays: reminderCadenceDays }
      : null
  );
  const pendingRows = $derived(rows.filter((r) => r.decision === "pending"));
  const reviewSummary = $derived(
    summarizeImportReview({
      importRows,
      pendingCount: pendingRows.length,
      duplicateCount: duplicateRows.length,
    })
  );

  const filterOptions: { kind: FilterKind; label: string }[] = $derived.by(() => {
    const base = [
      { kind: "all" as const, label: m.bank_review_filter_all() },
      { kind: "uncategorized" as const, label: m.bank_review_filter_uncategorized() },
      { kind: "income" as const, label: m.bank_review_filter_income() },
      { kind: "expense" as const, label: m.bank_review_filter_expense() },
    ];
    if (filterCounts.pending > 0) {
      return [{ kind: "pending" as const, label: m.bank_review_filter_pending() }, ...base];
    }
    return base;
  });

  $effect(() => {
    if (filter === "pending" && filterCounts.pending === 0) {
      filter = "all";
    }
  });

  function bankKindLabel(kind: ImportAdapterKind): string {
    return importAdapterLabel(kind);
  }

  function categoriesFor(type: "income" | "expense") {
    return (categoriesQuery.data ?? []).filter((c) => c.type === type);
  }

  async function createCategoryInline(name: string, type: TransactionType): Promise<string | null> {
    const trimmed = name.trim();
    if (trimmed === "") return null;
    try {
      const created = await createCategory({ name: trimmed, type });
      await queryClient.invalidateQueries({ queryKey: qk.categories(requireSessionUserId()) });
      toast.success(m.toast_category_created());
      return created.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.toast_error());
      return null;
    }
  }

  function duplicateDetail(rowId: string): string | null {
    const warning = warningsByRow.get(rowId);
    if (!warning) return null;
    const row = rows.find((item) => item.id === rowId);
    const selected = warning.obligation_candidates?.find(
      (candidate) => candidate.id === row?.duplicate_of
    );
    return m.bank_review_probable_duplicate_detail({
      date: selected?.date ?? warning.duplicate_of_date,
      amount: formatCurrency(
        selected?.amount ?? warning.duplicate_of_amount,
        selected?.currency ?? warning.duplicate_of_currency
      ),
      description: selected?.description ?? warning.duplicate_of_description,
    });
  }

  async function patchRow(rowId: string, patch: Partial<ImportRow>): Promise<void> {
    // NOTE: the getQueryData + setQueryData pair below MUST stay synchronous
    // (no await before it) - bulk callers fire many patchRow() via Promise.all
    // and rely on each reading the prior call's optimistic write. An await here
    // would reintroduce a sibling-clobber race.
    const previous = queryClient.getQueryData<ImportRow[]>(rowsKey);
    if (previous) {
      queryClient.setQueryData<ImportRow[]>(
        rowsKey,
        previous.map((r) => (r.id === rowId ? { ...r, ...patch } : r))
      );
    }
    try {
      await updateRowDecision(rowId, {
        decision: patch.decision,
        selectedCategoryId:
          patch.selected_category_id === undefined ? undefined : patch.selected_category_id,
        selectedGroupId:
          patch.selected_group_id === undefined ? undefined : patch.selected_group_id,
        editedDescription:
          patch.edited_description === undefined ? undefined : patch.edited_description,
        duplicateOf: patch.duplicate_of === undefined ? undefined : patch.duplicate_of,
        obligationMatchConfirmed: patch.obligation_match_confirmed,
      });
    } catch (e) {
      const original = previous?.find((r) => r.id === rowId);
      if (original) {
        queryClient.setQueryData<ImportRow[]>(rowsKey, (curr) =>
          (curr ?? []).map((r) => (r.id === rowId ? original : r))
        );
      }
      toast.error(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  // Review-level undo: every direct row mutation (decision toggle, category pick,
  // bulk action, rule cascade) records the prior row state. "Cofnij" restores the
  // last change's rows; it never deletes a captured rule (the rule-save toast
  // keeps its own undo for that).
  interface UndoPatch {
    rowId: string;
    before: Partial<ImportRow>;
  }
  let undoStack = $state<UndoPatch[][]>([]);
  const UNDO_LIMIT = 50;
  // Rule capture is async (POST + refresh + apply). If the user hits "Cofnij"
  // while it is in flight, the late apply would re-categorize the row they just
  // undid (it matches selected_category_id === previousCategoryId). Undo bumps
  // this epoch; applies started under an older epoch become no-ops.
  let ruleApplyEpoch = 0;

  function pushUndo(patches: UndoPatch[]): void {
    if (patches.length === 0) return;
    undoStack = [...undoStack.slice(-(UNDO_LIMIT - 1)), patches];
  }

  async function undoLastChange(): Promise<void> {
    ruleApplyEpoch += 1;
    const entry = undoStack.at(-1);
    if (!entry) return;

    // Pop the last entry and apply its patches.
    undoStack = undoStack.slice(0, -1);
    let alsoRestoredPrev: UndoPatch[] | null = null;
    try {
      await Promise.all(entry.map((p) => patchRow(p.rowId, p.before)));

      // If the last entry did not include any selected_category_id patches but the
      // previous entry does (common when a rule-save applied a cascade after the
      // user's explicit pick), only pop+apply that previous entry when it affects
      // at least one of the same rows — avoids undoing unrelated prior edits.
      const prev = undoStack.at(-1);
      const entryHasCategoryPatch = entry.some((p) =>
        Object.prototype.hasOwnProperty.call(p.before, "selected_category_id")
      );
      const prevHasCategoryPatch = prev
        ? prev.some((p) => Object.prototype.hasOwnProperty.call(p.before, "selected_category_id"))
        : false;

      const entryRowIds = new Set(entry.map((p) => p.rowId));
      const prevRowIds = new Set(prev ? prev.map((p) => p.rowId) : []);
      const overlap = [...entryRowIds].some((id) => prevRowIds.has(id));

      if (!entryHasCategoryPatch && prevHasCategoryPatch && overlap) {
        alsoRestoredPrev = prev!;
        undoStack = undoStack.slice(0, -1);
        await Promise.all(prev!.map((p) => patchRow(p.rowId, p.before)));
      }

      toast.success(m.bank_review_change_undone());
    } catch {
      // Persistence failed — put the stack back so the user can retry.
      if (alsoRestoredPrev) undoStack = [...undoStack, alsoRestoredPrev];
      undoStack = [...undoStack, entry];
      toast.error(m.bank_review_undo_failed());
    }
  }

  async function setDecision(row: ImportRow, decision: "import" | "skip"): Promise<void> {
    pushUndo([{ rowId: row.id, before: { decision: row.decision } }]);
    await patchRow(row.id, { decision });
  }

  async function chooseObligation(row: ImportRow, candidateId: string | null): Promise<void> {
    pushUndo([
      {
        rowId: row.id,
        before: {
          decision: row.decision,
          duplicate_of: row.duplicate_of,
          obligation_match_confirmed: row.obligation_match_confirmed ?? false,
        },
      },
    ]);
    try {
      await patchRow(row.id, {
        decision: candidateId ? "duplicate" : "import",
        duplicate_of: candidateId,
        obligation_match_confirmed: candidateId !== null,
      });
    } catch {
      // patchRow restores the row and reports the failed save.
    }
  }

  async function bulkImportVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision === "pending");
    pushUndo(targets.map((r) => ({ rowId: r.id, before: { decision: r.decision } })));
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "import" })));
  }

  async function bulkRestoreVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision === "skip");
    pushUndo(targets.map((r) => ({ rowId: r.id, before: { decision: r.decision } })));
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "pending" })));
  }

  interface UndoSnapshot {
    id: string;
    selected_category_id: string | null;
    decision: RowDecision;
  }

  function rowMatchesRule(row: ImportRow, rule: CategorizationRule): boolean {
    const cats = categoriesQuery.data ?? [];
    return (
      matchCategory(
        { ...row, description: row.edited_description ?? row.description },
        [rule],
        cats
      ) !== null
    );
  }

  function ruleHasTextScope(rule: CategorizationRule): boolean {
    return (
      (rule.match_description?.trim() ?? "") !== "" ||
      (rule.match_counterparty?.trim() ?? "") !== ""
    );
  }

  function draftRuleForRow(row: ImportRow): CategorizationRule | null {
    if (!row.selected_category_id) return null;
    const draft = suggestRuleFromRow({
      ...row,
      description: row.edited_description ?? row.description,
    });
    if (!draft) return null;
    return {
      id: "__draft__",
      user_id: "__draft__",
      ...draft,
      match_day_of_month: null,
      category_id: row.selected_category_id,
      priority: MANUAL_RULE_PRIORITY,
      created_at: "",
    };
  }

  function categoryActionFor(row: ImportRow): RowCategoryAction | null {
    const context = pendingCategoryReplacement[row.id];
    const draft = draftRuleForRow(row);
    if (!context || !draft || matchedRuleFor(row)) return null;

    const similarCount = activeRows.filter(
      (candidate) =>
        candidate.id !== row.id &&
        candidate.decision !== "skip" &&
        areSimilarImportRows(candidate, row) &&
        (candidate.selected_category_id == null ||
          candidate.selected_category_id === context.previousCategoryId)
    ).length;
    const canUpdatePreviousRule =
      context.previousRule != null &&
      context.previousRule.category_id !== row.selected_category_id &&
      ruleHasTextScope(context.previousRule);

    return { kind: canUpdatePreviousRule ? "update" : "save", similarCount };
  }

  async function applyCategoryToSimilarRows(row: ImportRow): Promise<void> {
    const context = pendingCategoryReplacement[row.id];
    const draft = draftRuleForRow(row);
    if (!context || !draft || !row.selected_category_id) return;

    const targets = activeRows.filter((candidate) => {
      if (
        candidate.id === row.id ||
        candidate.decision === "skip" ||
        !areSimilarImportRows(candidate, row)
      )
        return false;
      return (
        candidate.selected_category_id == null ||
        candidate.selected_category_id === context.previousCategoryId
      );
    });
    pushUndo(
      targets.map((candidate) => ({
        rowId: candidate.id,
        before: { selected_category_id: candidate.selected_category_id },
      }))
    );
    const results = await Promise.allSettled(
      targets.map((candidate) =>
        patchRow(candidate.id, { selected_category_id: row.selected_category_id })
      )
    );
    const changed = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - changed;
    if (changed > 0) toast.success(m.bank_review_similar_applied({ count: changed }));
    if (failed > 0) toast.error(m.toast_error());
  }

  async function saveOrUpdateRuleForRow(row: ImportRow): Promise<void> {
    const context = pendingCategoryReplacement[row.id];
    if (!context || !row.selected_category_id) return;

    const previousRule = context.previousRule;
    if (
      previousRule &&
      previousRule.category_id !== row.selected_category_id &&
      ruleHasTextScope(previousRule)
    ) {
      try {
        const updated = await updateCategorizationRule(previousRule.id, {
          category_id: row.selected_category_id,
        });
        const nextRules = await refreshRules();
        const nextRule = nextRules.find((rule) => rule.id === updated.id) ?? updated;
        await applyRuleCategoryToRows(nextRule, context.previousCategoryId);
        toast.success(m.bank_review_rule_updated());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    captureRuleForRow(row, context.previousCategoryId, ruleApplyEpoch);
  }

  async function refreshRules(): Promise<CategorizationRule[]> {
    const rules = await fetchCategorizationRules();
    queryClient.setQueryData(rulesKey, rules);
    return rules;
  }

  async function applyRuleCategoryToRows(
    rule: CategorizationRule,
    previousCategoryId: string | null,
    epoch?: number,
    sourceRowId?: string
  ): Promise<UndoSnapshot[]> {
    if (epoch !== undefined && epoch !== ruleApplyEpoch) return [];
    const targets = activeRows.filter((r) => {
      if (!rowMatchesRule(r, rule)) return false;
      if (r.selected_category_id === rule.category_id) return false;
      if (r.id === sourceRowId) return true;
      return r.selected_category_id == null || r.selected_category_id === previousCategoryId;
    });
    const snapshots = targets.map((r) => ({
      id: r.id,
      selected_category_id: r.selected_category_id,
      decision: r.decision,
    }));
    pushUndo(
      targets.map((r) => ({
        rowId: r.id,
        before: { selected_category_id: r.selected_category_id },
      }))
    );
    const results = await Promise.allSettled(
      targets.map((r) => patchRow(r.id, { selected_category_id: rule.category_id }))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(m.toast_error());
    return snapshots;
  }

  async function reconcileEditedRuleRows(
    previousRule: CategorizationRule,
    nextRule: CategorizationRule,
    nextRules: CategorizationRule[]
  ): Promise<void> {
    const previousOwnedIds = new Set(
      activeRows
        .filter(
          (r) =>
            r.selected_category_id === previousRule.category_id && rowMatchesRule(r, previousRule)
        )
        .map((r) => r.id)
    );
    const cats = categoriesQuery.data ?? [];
    const targets = activeRows
      .map((row) => {
        const matchesNextRule = rowMatchesRule(row, nextRule);
        const wasOwnedByPreviousRule = previousOwnedIds.has(row.id);
        if (!matchesNextRule && !wasOwnedByPreviousRule) return null;
        if (
          row.selected_category_id !== previousRule.category_id &&
          row.selected_category_id != null
        )
          return null;

        const nextCategoryId = matchesNextRule
          ? nextRule.category_id
          : matchCategory(
              { ...row, description: row.edited_description ?? row.description },
              nextRules,
              cats
            );
        if (row.selected_category_id === nextCategoryId) return null;
        return { row, nextCategoryId };
      })
      .filter((entry): entry is { row: ImportRow; nextCategoryId: string | null } => entry != null);

    const results = await Promise.allSettled(
      targets.map(({ row, nextCategoryId }) =>
        patchRow(row.id, { selected_category_id: nextCategoryId })
      )
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(m.toast_error());
  }

  async function undoSavedRule(
    ruleId: string,
    changedRows: UndoSnapshot[],
    appliedCategoryId: string
  ): Promise<void> {
    try {
      await deleteCategorizationRule(ruleId);
      createdRuleIds = createdRuleIds.filter((id) => id !== ruleId);
      const current = queryClient.getQueryData<ImportRow[]>(rowsKey) ?? [];
      await Promise.all(
        changedRows
          .filter((snap) => {
            const now = current.find((r) => r.id === snap.id);
            // Skip rows the user re-categorized after the rule applied.
            return now?.selected_category_id === appliedCategoryId;
          })
          .map((row) =>
            patchRow(row.id, {
              selected_category_id: row.selected_category_id,
              decision: row.decision,
            })
          )
      );
      await queryClient.invalidateQueries({
        queryKey: qk.categorizationRules(requireSessionUserId()),
      });
      toast.success(m.bank_review_rule_undone());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function createAndApplyRule(
    input: CategorizationRuleInput & {
      previousCategoryId?: string | null;
      epoch?: number;
      sourceRowId?: string;
    }
  ): Promise<CategorizationRule> {
    const created = await createCategorizationRule(input);
    createdRuleIds = [...createdRuleIds, created.id];
    let snapshots: UndoSnapshot[];
    try {
      await refreshRules();
      snapshots = await applyRuleCategoryToRows(
        created,
        input.previousCategoryId ?? null,
        input.epoch,
        input.sourceRowId
      );
    } catch {
      // Persistence already succeeded. Do not leave a retry button that creates a duplicate.
      toast.warning(m.rule_v2_apply_error());
      return created;
    }

    const toastMsg =
      snapshots.length > 0
        ? m.bank_review_save_rule_success({ count: snapshots.length })
        : m.bank_review_save_rule_success_solo();
    toast.success(toastMsg, {
      action: {
        label: m.common_undo(),
        onClick: () => void undoSavedRule(created.id, snapshots, created.category_id),
      },
      ...(snapshots.length > 0
        ? {
            cancel: {
              label: m.bank_review_rule_show_matches_short(),
              onClick: () => (inspectedRuleId = created.id),
            },
          }
        : {}),
      duration: 8000,
    });

    return created;
  }

  function captureRuleForRow(
    row: ImportRow,
    previousCategoryId: string | null,
    epoch?: number
  ): void {
    if (!row.selected_category_id) return;
    capturingRule = { row, previousCategoryId, epoch };
  }

  async function createCapturedRule(input: CategorizationRuleInput): Promise<void> {
    const context = capturingRule;
    if (!context) return;
    await createAndApplyRule({
      ...input,
      previousCategoryId: context.previousCategoryId,
      epoch: context.epoch,
      sourceRowId: context.row.id,
    });
    if (context.signature)
      dismissedRuleSuggestions = new Set([...dismissedRuleSuggestions, context.signature]);
  }

  async function handleRowCategoryChange(
    row: ImportRow,
    selectedCategoryId: string | null
  ): Promise<void> {
    const pendingReplacement = pendingCategoryReplacement[row.id];
    const previousCategoryId = pendingReplacement?.previousCategoryId ?? row.selected_category_id;
    const previousRule = pendingReplacement?.previousRule ?? matchedRuleFor(row);
    if (!selectedCategoryId && row.selected_category_id != null) {
      pendingCategoryReplacement = {
        ...pendingCategoryReplacement,
        [row.id]: {
          previousCategoryId: row.selected_category_id,
          previousRule,
        },
      };
    }
    pushUndo([{ rowId: row.id, before: { selected_category_id: row.selected_category_id } }]);
    await patchRow(row.id, { selected_category_id: selectedCategoryId });
    if (!selectedCategoryId) return;
    pendingCategoryReplacement = {
      ...pendingCategoryReplacement,
      [row.id]: { previousCategoryId, previousRule },
    };
  }

  function getImportedDateRange(): ImportedDateRange | undefined {
    const dates = rows
      .filter((r) => r.decision === "import")
      .map((r) => r.posted_at)
      .sort();
    const first = dates[0];
    const last = dates.at(-1);
    if (!first || !last) return undefined;

    const [startYear, startMonth] = first.split("-").map(Number);
    const [endYear, endMonth] = last.split("-").map(Number);
    if (!startYear || !startMonth || !endYear || !endMonth) return undefined;

    return { startYear, startMonth, endYear, endMonth };
  }

  function matchedRuleFor(row: ImportRow) {
    if (!row.selected_category_id) return null;
    const cats = categoriesQuery.data ?? [];
    return (
      (rulesQuery.data ?? []).find(
        (rule) =>
          rule.category_id === row.selected_category_id &&
          matchCategory(
            { ...row, description: row.edited_description ?? row.description },
            [rule],
            cats
          ) !== null
      ) ?? null
    );
  }

  function openRuleEditor(rule: CategorizationRule): void {
    editingRule = rule;
    editDesc = rule.match_description ?? "";
    editCounterparty = rule.match_counterparty ?? "";
    editDescEnabled = rule.match_description != null;
    editCounterpartyEnabled = rule.match_counterparty != null;
    editDateEnabled = rule.match_day_of_month != null;
    editDayOfMonth = String(rule.match_day_of_month ?? 1);
    showAdvancedRuleOptions = editDateEnabled;
    editRuleOpen = true;
  }

  function closeRuleEditor(): void {
    editRuleOpen = false;
    editingRule = null;
  }

  async function saveRuleEditor(): Promise<void> {
    if (!editingRule) return;

    const built = buildCategorizationRuleEditPatch(editingRule, {
      categoryId: editingRule.category_id,
      descEnabled: editDescEnabled,
      desc: editDesc,
      counterpartyEnabled: editCounterpartyEnabled,
      counterparty: editCounterparty,
      dateEnabled: editDateEnabled,
      dayOfMonth: editDayOfMonth,
    });
    if (!built.ok) {
      if (built.issue === "require_condition") {
        toast.error(m.bank_review_rule_edit_require_condition());
      } else if (built.issue === "require_text") {
        toast.error(m.bank_review_rule_edit_require_text());
      } else {
        toast.error(m.bank_review_rule_edit_require_date());
      }
      return;
    }

    editRuleSaving = true;
    try {
      const previousRule = editingRule;
      await updateCategorizationRule(previousRule.id, built.patch);
      const nextRules = await refreshRules();
      const nextRule = nextRules.find((rule) => rule.id === previousRule.id);
      if (nextRule) {
        await reconcileEditedRuleRows(previousRule, nextRule, nextRules);
      }
      toast.success(m.bank_review_rule_updated());
      closeRuleEditor();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      editRuleSaving = false;
    }
  }

  async function importDuplicateAnyway(row: ImportRow): Promise<void> {
    pushUndo([{ rowId: row.id, before: { decision: row.decision } }]);
    await patchRow(row.id, { decision: "import" });
  }

  async function restoreAllDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => r.decision === "duplicate");
    pushUndo(flagged.map((r) => ({ rowId: r.id, before: { decision: r.decision } })));
    await Promise.all(flagged.map((r) => patchRow(r.id, { decision: "pending" })));
  }

  const commitMut = createMutation(() => ({
    mutationFn: () => commitImportSession(session.id),
    onSuccess: (result) => {
      void storyForCommit(result).then((story) => {
        onCommitted(result, getImportedDateRange(), story);
      });
    },
    onError: (err: { message: string; details?: string | null }) => {
      const msg = err.message ?? "";
      if (msg.includes("account_invalid")) toast.error(m.bank_commit_error_account_invalid());
      else if (msg.includes("account_kind_mismatch"))
        toast.error(m.bank_commit_error_kind_mismatch());
      else if (msg.includes("rows_pending")) toast.error(m.bank_commit_error_rows_pending());
      else if (msg.includes("category_invalid") || msg.includes("category_required"))
        toast.error(m.bank_commit_error_category_invalid());
      else if (msg.includes("group_forbidden")) toast.error(m.bank_commit_error_group_forbidden());
      else toast.error(m.bank_commit_error_generic());
    },
  }));

  function commitOrConfirm(): void {
    if (importRows.length > 0 || needsConfirm) confirmOpen = true;
    else commitMut.mutate();
  }

  function confirmCommit(): void {
    void commitMut.mutateAsync().then(() => {
      confirmOpen = false;
    });
  }

  // "Inne" escape hatch: park every still-uncategorized row as skipped and commit the
  // clean remainder. Skipped rows stay in the session history; nothing is lost.
  async function skipInneAndCommit(): Promise<void> {
    const targets = inneRows;
    pushUndo(targets.map((r) => ({ rowId: r.id, before: { decision: r.decision } })));
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
    if (importRows.length === 0) {
      // Every import row was uncategorized - nothing left to commit.
      confirmOpen = false;
      toast.info(m.bank_review_commit_zero_hint());
      return;
    }
    confirmCommit();
  }
</script>

{#snippet decisionControl(row: ImportRow)}
  <div class="inline-flex items-center gap-1.5">
    <button
      type="button"
      class={cn(
        "focus-visible:ring-accent inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none md:h-7 md:min-h-0 md:min-w-0",
        row.decision === "import"
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-white/10 text-slate-400 hover:bg-white/5"
      )}
      title={m.bank_review_decision_import()}
      aria-label={m.bank_review_decision_import()}
      aria-pressed={row.decision === "import"}
      onclick={() => void setDecision(row, "import")}
    >
      <span>{m.bank_review_decision_import()}</span>
    </button>
    <button
      type="button"
      class={cn(
        "focus-visible:ring-accent inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none md:h-7 md:min-h-0 md:min-w-0",
        row.decision === "skip"
          ? "border-white/20 bg-white/10 text-slate-200"
          : "border-white/10 text-slate-400 hover:bg-white/5"
      )}
      title={m.bank_review_decision_skip()}
      aria-label={m.bank_review_decision_skip()}
      aria-pressed={row.decision === "skip"}
      onclick={() => void setDecision(row, "skip")}
    >
      <span>{m.bank_review_decision_skip()}</span>
    </button>
  </div>
{/snippet}

<div class="space-y-4">
  {#each rows.filter((row) => row.decision === "pending" && (warningsByRow.get(row.id)?.obligation_candidates?.length ?? 0) > 1) as row (row.id)}
    <section class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <p class="text-sm font-medium text-amber-100">
        {m.bank_review_ambiguous_obligation({
          description: row.counterparty ?? row.description,
          amount: formatCurrency(row.amount, row.currency),
        })}
      </p>
      <p class="mt-1 text-xs text-slate-300">{m.bank_review_ambiguous_obligation_hint()}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        {#each warningsByRow.get(row.id)?.obligation_candidates ?? [] as candidate (candidate.id)}
          <Button
            variant="ghost"
            size="lg"
            disabled={rows.some(
              (other) =>
                other.id !== row.id &&
                other.decision === "duplicate" &&
                other.obligation_match_confirmed &&
                other.duplicate_of === candidate.id
            )}
            onclick={() => void chooseObligation(row, candidate.id)}
          >
            {m.bank_review_confirm_obligation({
              description: candidate.description,
              date: candidate.date,
            })}
          </Button>
        {/each}
        <Button variant="ghost" size="lg" onclick={() => void chooseObligation(row, null)}>
          {m.bank_review_separate_transaction()}
        </Button>
      </div>
    </section>
  {/each}
  {#if accountQuery.data}
    <p class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
      {m.bank_review_account_destination({
        bank: bankKindLabel(accountQuery.data.kind),
        account: accountQuery.data.label,
      })}
    </p>
  {/if}

  <DuplicateBanner
    {duplicateRows}
    {duplicateDetail}
    onImportAnyway={(row) => void importDuplicateAnyway(row)}
    onRestoreAll={() => void restoreAllDuplicates()}
  />

  {#if topRuleSuggestion}
    <div
      class="flex flex-col gap-3 rounded-xl border border-sky-500/20 bg-sky-950/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-sm text-slate-200">
        {m.bank_review_rule_suggestion_banner({
          text: topRuleSuggestion.text,
          count: topRuleSuggestion.count,
          category: topRuleSuggestion.categoryName,
        })}
      </p>
      <div class="flex shrink-0 gap-2">
        <Button
          variant="accent"
          size="sm"
          onclick={() => void acceptRuleSuggestion(topRuleSuggestion)}
        >
          {m.bank_review_rule_suggestion_save()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onclick={() => {
            dismissedRuleSuggestions = new Set([
              ...dismissedRuleSuggestions,
              topRuleSuggestion.signature,
            ]);
          }}
        >
          {m.bank_review_rule_suggestion_dismiss()}
        </Button>
      </div>
    </div>
  {/if}

  <ImportReviewCategorizeStep
    {parseErrorCount}
    {skippedRowCount}
    largeRowCount={rows.length}
    {bulkImportableVisibleCount}
    {bulkRestorableVisibleCount}
    {filter}
    {filterCounts}
    {filterOptions}
    {visibleRows}
    bind:advancedFilter
    {advancedActive}
    onclearfilter={clearAdvancedFilter}
    filterCategories={categoriesQuery.data ?? []}
    totalActiveRows={activeRows.length}
    groups={groupsQuery.data ?? []}
    {categoriesFor}
    {createCategoryInline}
    {matchedRuleFor}
    {categoryActionFor}
    {spanNudge}
    {reviewSummary}
    {inspectedRule}
    inspectedRuleCount={inspectedRuleRows.length}
    onClearInspectedRule={() => (inspectedRuleId = null)}
    canUndo={undoStack.length > 0}
    onUndo={() => void undoLastChange()}
    onFilterChange={(k) => {
      inspectedRuleId = null;
      filter = k;
    }}
    onClearFilter={() => {
      inspectedRuleId = null;
      clearAdvancedFilter();
      filter = "all";
    }}
    onBulkImportVisible={() => void bulkImportVisible()}
    onBulkRestoreVisible={() => void bulkRestoreVisible()}
    onPatchRow={(id, patch) => void patchRow(id, patch)}
    onCategoryChange={(row, id) => void handleRowCategoryChange(row, id)}
    onApplySimilar={(row) => void applyCategoryToSimilarRows(row)}
    onSaveRule={(row) => void saveOrUpdateRuleForRow(row)}
    onEditRule={(rule) => openRuleEditor(rule)}
    {celeCategoryId}
    {savePlans}
    {decisionControl}
  />

  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3 pb-(--mobile-action-bottom) backdrop-blur md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
  >
    <div class="min-w-0 text-xs text-slate-400">
      {#if pendingRows.length > 0}
        <span class="text-amber-300">
          {m.bank_review_pending_warning({ count: pendingRows.length })}
        </span>
        {#if rows.some((r) => r.is_hold && r.decision === "pending")}
          <p class="text-muted-foreground text-sm">{m.bank_review_hold_hint()}</p>
        {/if}
      {:else if importRows.length === 0 && duplicateRows.length > 0}
        <span>{m.bank_review_finish_hint()}</span>
      {:else if importRows.length === 0}
        <span class="text-amber-300">{m.bank_review_commit_zero_hint()}</span>
      {:else}
        {m.bank_review_footer_counts({
          imp: importRows.length,
          skip: skippedRows.length,
          inne: uncategorizedImportRows.length,
        })}
      {/if}
    </div>
    <div class="flex gap-2">
      <Button variant="ghost" onclick={() => void onCancel()} disabled={commitMut.isPending}>
        {m.bank_review_cancel()}
      </Button>
      <Button
        variant="primary"
        disabled={(importRows.length === 0 && duplicateRows.length === 0) ||
          pendingRows.length > 0 ||
          commitMut.isPending}
        loading={commitMut.isPending}
        onclick={commitOrConfirm}
      >
        {importRows.length === 0
          ? m.bank_review_finish_action()
          : importActionLabel(importRows.length)}
      </Button>
    </div>
  </div>
</div>

<ImportConfirmSheet
  open={confirmOpen}
  importCount={importRows.length}
  skipCount={skippedRows.length}
  dupCount={duplicateRows.length}
  {inneRows}
  automaticCount={importRows.filter(
    (row) =>
      row.selected_category_id != null && row.selected_category_id === row.suggested_category_id
  ).length}
  manualCount={importRows.filter(
    (row) =>
      row.selected_category_id != null && row.selected_category_id !== row.suggested_category_id
  ).length}
  newRuleCount={createdRuleIds.length}
  commitPending={commitMut.isPending}
  onClose={() => (confirmOpen = false)}
  onCommit={confirmCommit}
  onSkipInne={() => void skipInneAndCommit()}
/>

{#if capturingRule}
  <RuleCreateDialog
    open={true}
    row={{
      ...capturingRule.row,
      description: capturingRule.row.edited_description ?? capturingRule.row.description,
    }}
    categoryId={capturingRule.row.selected_category_id ?? ""}
    categories={categoriesQuery.data ?? []}
    rows={activeRows.map((r) => ({ ...r, description: r.edited_description ?? r.description }))}
    oncreate={createCapturedRule}
    onclose={() => (capturingRule = null)}
  />
{/if}

<Dialog open={editRuleOpen} onclose={closeRuleEditor} title={m.bank_review_rule_edit()}>
  <div class="space-y-3">
    {#if editRuleTypeLabel}
      <p class="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
        {m.rules_field_type()}: {editRuleTypeLabel}
        {#if editingRule?.kind === "type"}
          <span class="text-slate-500"> · {m.rules_kind_locked_hint()}</span>
        {/if}
      </p>
    {/if}

    {#if editRuleShowsText}
      <p class="text-xs text-slate-400">
        {editingRule?.match_operator === "all"
          ? m.rule_v2_all_conditions()
          : m.rule_v2_legacy_conditions()}
      </p>
      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" bind:checked={editDescEnabled} />
        <span>{m.bank_review_rule_if_description()}</span>
      </label>
      <Input
        value={editDesc}
        disabled={!editDescEnabled}
        placeholder={m.bank_review_save_rule_field_description()}
        onchange={(e) => (editDesc = (e.target as HTMLInputElement).value)}
      />

      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" bind:checked={editCounterpartyEnabled} />
        <span>{m.bank_review_rule_if_counterparty()}</span>
      </label>
      <Input
        value={editCounterparty}
        disabled={!editCounterpartyEnabled}
        placeholder={m.bank_review_save_rule_field_counterparty()}
        onchange={(e) => (editCounterparty = (e.target as HTMLInputElement).value)}
      />
    {/if}

    <div class="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <button
        type="button"
        class="text-xs font-medium text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
        onclick={() => (showAdvancedRuleOptions = !showAdvancedRuleOptions)}
      >
        {m.bank_review_rule_advanced_toggle()}
      </button>
      {#if showAdvancedRuleOptions}
        <div class="mt-2 space-y-2">
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" bind:checked={editDateEnabled} />
            <span>{m.bank_review_rule_if_date()}</span>
          </label>
          <Input
            type="number"
            min="1"
            max="31"
            value={editDayOfMonth}
            disabled={!editDateEnabled}
            placeholder={m.bank_review_rule_day_placeholder()}
            onchange={(e) => (editDayOfMonth = (e.target as HTMLInputElement).value)}
          />
        </div>
      {/if}
    </div>

    <p class="text-sm text-slate-300" aria-live="polite">
      {m.rule_v2_preview_count({ count: editedRuleMatches.length })}
    </p>
    {#if editedRulePreview && editedRuleMatches.length === 0}<p class="text-xs text-amber-300">
        {m.rule_v2_no_matches()}
      </p>{/if}
    <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
      <Button
        variant="ghost"
        disabled={editRuleSaving}
        onclick={() => {
          if (editingRule) inspectedRuleId = editingRule.id;
          closeRuleEditor();
        }}
      >
        {m.bank_review_rule_show_matches()}
      </Button>
      <div class="flex gap-2">
        <Button variant="ghost" onclick={closeRuleEditor} disabled={editRuleSaving}>
          {m.common_cancel()}
        </Button>
        <Button
          variant="primary"
          onclick={() => void saveRuleEditor()}
          loading={editRuleSaving}
          disabled={editRuleSaving}
        >
          {m.common_save()}
        </Button>
      </div>
    </div>
  </div>
</Dialog>
