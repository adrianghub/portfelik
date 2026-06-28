<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import DuplicateBanner from "$lib/components/import/DuplicateBanner.svelte";
  import ImportReviewCategorizeStep from "$lib/components/import/ImportReviewCategorizeStep.svelte";
  import ImportConfirmSheet from "$lib/components/import/ImportConfirmSheet.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { createCategory, fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    createCategorizationRule,
    deleteCategorizationRule,
    fetchCategorizationRules,
    updateCategorizationRule,
  } from "$lib/services/categorization-rules";
  import {
    findDuplicateCategorizationRule,
    matchCategory,
    suggestRuleText,
  } from "$lib/import/categorize";
  import { detectCategoryRuleSuggestions } from "$lib/import/category-rule-suggestions";
  import { fetchPlans } from "$lib/services/plans";
  import { resolveCeleCategoryId } from "$lib/services/goal-spending";
  import type { CategorizationRule, TransactionType } from "$lib/types";
  import { importAdapterLabel } from "$lib/import/banks/registry";
  import {
    filterImportRows,
    isImportRowFilterActive,
    EMPTY_IMPORT_ROW_FILTER,
    type ImportRowFilter,
  } from "$lib/import/filter-rows";
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
  import { supabase } from "$lib/supabase";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import { cn, formatCurrency } from "$lib/utils";
  import { Check, X } from "lucide-svelte";

  interface Props {
    session: ImportSession;
    parseErrorCount?: number;
    skippedRowCount?: number;
    onCommitted: (result: CommitResult, dateRange?: ImportedDateRange) => void;
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
  const rowsKey = $derived(["import_session_rows", session.id]);

  let filter = $state<FilterKind>("all");
  let advancedFilter = $state<ImportRowFilter>({ ...EMPTY_IMPORT_ROW_FILTER });
  const advancedActive = $derived(isImportRowFilterActive(advancedFilter));
  function clearAdvancedFilter(): void {
    advancedFilter = { ...EMPTY_IMPORT_ROW_FILTER };
  }
  let confirmOpen = $state(false);
  let editRuleOpen = $state(false);
  let editingRule = $state<CategorizationRule | null>(null);
  let editDescEnabled = $state(false);
  let editDesc = $state("");
  let editCounterpartyEnabled = $state(false);
  let editCounterparty = $state("");
  let editDateEnabled = $state(false);
  let editDayOfMonth = $state("1");
  let showAdvancedRuleOptions = $state(false);
  let editRuleSaving = $state(false);
  let queueInitialized = $state(false);
  let pendingCategoryReplacement = $state<
    Record<
      string,
      {
        previousCategoryId: string | null;
        previousRule: CategorizationRule | null;
      }
    >
  >({});

  const rowsQuery = createQuery(() => ({
    queryKey: rowsKey,
    queryFn: () => fetchSessionRows(session.id),
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const rulesQuery = createQuery(() => ({
    queryKey: ["categorization_rules"],
    queryFn: fetchCategorizationRules,
  }));

  const savePlansQuery = createQuery(() => ({
    queryKey: ["plans", "save-hints"],
    queryFn: async () => {
      const plans = await fetchPlans();
      return plans.filter((p) => p.kind === "save").map((p) => ({ id: p.id, name: p.name }));
    },
  }));

  const warningsQuery = createQuery(() => ({
    queryKey: ["import_preview_warnings", session.id],
    queryFn: () => previewFingerprintWarnings(session.id),
  }));

  const accountQuery = createQuery(() => ({
    queryKey: ["bank_account", session.bank_account_id],
    queryFn: () => fetchBankAccount(session.bank_account_id),
  }));

  const profileQuery = createQuery(() => ({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      return fetchProfile(user.id);
    },
  }));

  const warningsByRow = $derived(new Map((warningsQuery.data ?? []).map((w) => [w.row_id, w])));
  const rows = $derived<ImportRow[]>(rowsQuery.data ?? []);

  // activeRows = rows the user is deciding on (not auto-skipped duplicates).
  const activeRows = $derived(rows.filter((r) => r.decision !== "duplicate"));
  const importRows = $derived(rows.filter((r) => r.decision === "import"));
  const skippedRows = $derived(rows.filter((r) => r.decision === "skip"));
  const duplicateRows = $derived(rows.filter((r) => r.decision === "duplicate"));
  const uncategorizedImportRows = $derived(
    importRows.filter((r) => r.selected_category_id == null)
  );

  const filterCounts = $derived({
    pending: activeRows.filter((r) => r.decision === "pending").length,
    all: activeRows.length,
    uncategorized: activeRows.filter((r) => r.selected_category_id == null).length,
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
        base = activeRows.filter((r) => r.selected_category_id == null);
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

  const celeCategoryId = $derived(resolveCeleCategoryId(categoriesQuery.data ?? []));
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
    try {
      await createCategorizationRule({
        kind: "contains",
        match_description: suggestion.text,
        match_counterparty: suggestion.text,
        match_type: null,
        category_id: suggestion.categoryId,
        priority: MANUAL_RULE_PRIORITY,
      });
      await refreshRules();
      toast.success(m.rule_capture_created());
      dismissedRuleSuggestions = new Set([...dismissedRuleSuggestions, suggestion.signature]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "duplicate_categorization_rule") {
        toast.info(m.bank_review_rule_already_saved({ rule: suggestion.text }));
        dismissedRuleSuggestions = new Set([...dismissedRuleSuggestions, suggestion.signature]);
      } else {
        toast.error(msg);
      }
    }
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
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
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
    return m.bank_review_probable_duplicate_detail({
      date: warning.duplicate_of_date,
      amount: formatCurrency(warning.duplicate_of_amount, warning.duplicate_of_currency),
      description: warning.duplicate_of_description,
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
      });
    } catch (e) {
      const original = previous?.find((r) => r.id === rowId);
      if (original) {
        queryClient.setQueryData<ImportRow[]>(rowsKey, (curr) =>
          (curr ?? []).map((r) => (r.id === rowId ? original : r))
        );
      }
      toast.error(e instanceof Error ? e.message : String(e));
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

  function pushUndo(patches: UndoPatch[]): void {
    if (patches.length === 0) return;
    undoStack = [...undoStack.slice(-(UNDO_LIMIT - 1)), patches];
  }

  async function undoLastChange(): Promise<void> {
    const entry = undoStack.at(-1);
    if (!entry) return;
    undoStack = undoStack.slice(0, -1);
    await Promise.all(entry.map((p) => patchRow(p.rowId, p.before)));
    toast.success(m.bank_review_change_undone());
  }

  async function setDecision(row: ImportRow, decision: "import" | "skip"): Promise<void> {
    pushUndo([{ rowId: row.id, before: { decision: row.decision } }]);
    await patchRow(row.id, { decision });
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
    return matchCategory(row, [rule], cats) !== null;
  }

  function ruleHasTextScope(rule: CategorizationRule): boolean {
    return (
      (rule.match_description?.trim() ?? "") !== "" ||
      (rule.match_counterparty?.trim() ?? "") !== ""
    );
  }

  async function refreshRules(): Promise<CategorizationRule[]> {
    const rules = await fetchCategorizationRules();
    queryClient.setQueryData(["categorization_rules"], rules);
    return rules;
  }

  async function applyRuleCategoryToRows(
    rule: CategorizationRule,
    previousCategoryId: string | null
  ): Promise<UndoSnapshot[]> {
    const targets = activeRows.filter((r) => {
      if (!rowMatchesRule(r, rule)) return false;
      if (r.selected_category_id === rule.category_id) return false;
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
          : matchCategory(row, nextRules, cats);
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
      await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
      toast.success(m.bank_review_rule_undone());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function createAndApplyRule(input: {
    kind: "contains" | "exact";
    categoryId: string;
    text: string;
    previousCategoryId?: string | null;
  }): Promise<CategorizationRule> {
    const text = input.text.trim();
    const candidate = {
      id: "__draft__",
      user_id: "__draft__",
      kind: input.kind,
      match_description: text,
      match_counterparty: text,
      match_type: null,
      match_day_of_month: null,
      category_id: input.categoryId,
      priority: MANUAL_RULE_PRIORITY,
      created_at: "",
    } satisfies CategorizationRule;

    if (findDuplicateCategorizationRule(rulesQuery.data ?? [], candidate)) {
      throw new Error("duplicate_categorization_rule");
    }

    const created = await createCategorizationRule({
      kind: input.kind,
      category_id: input.categoryId,
      match_description: text,
      match_counterparty: text,
      match_day_of_month: null,
      priority: MANUAL_RULE_PRIORITY,
    });
    await refreshRules();

    const snapshots = await applyRuleCategoryToRows(created, input.previousCategoryId ?? null);

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

  async function captureRuleForRow(
    row: ImportRow,
    previousCategoryId: string | null
  ): Promise<boolean> {
    if (!row.selected_category_id) return false;
    const text = suggestRuleText(row);
    if (text === "") return false;
    const draft = {
      id: "__draft__",
      user_id: "__draft__",
      kind: "contains",
      match_description: text,
      match_counterparty: text,
      match_type: null,
      match_day_of_month: null,
      category_id: row.selected_category_id,
      priority: MANUAL_RULE_PRIORITY,
      created_at: "",
    } satisfies CategorizationRule;

    const duplicate = findDuplicateCategorizationRule(rulesQuery.data ?? [], draft);
    if (duplicate) {
      const duplicateLabel = duplicate.match_description ?? duplicate.match_counterparty ?? text;
      await applyRuleCategoryToRows(duplicate, previousCategoryId);
      toast.info(m.bank_review_rule_already_saved({ rule: duplicateLabel }));
      return true;
    }

    try {
      await createAndApplyRule({
        kind: "contains",
        categoryId: row.selected_category_id,
        text,
        previousCategoryId,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "duplicate_categorization_rule") {
        toast.info(m.bank_review_rule_already_saved({ rule: text }));
        return true;
      }
      toast.error(msg);
      return false;
    }
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
    if (pendingReplacement) {
      const nextPending = { ...pendingCategoryReplacement };
      delete nextPending[row.id];
      pendingCategoryReplacement = nextPending;
    }

    const patchedRow: ImportRow = { ...row, selected_category_id: selectedCategoryId };
    if (matchedRuleFor(patchedRow)) return;

    if (
      previousRule &&
      previousRule.category_id !== selectedCategoryId &&
      ruleHasTextScope(previousRule)
    ) {
      try {
        const updated = await updateCategorizationRule(previousRule.id, {
          category_id: selectedCategoryId,
        });
        const nextRules = await refreshRules();
        const nextRule = nextRules.find((rule) => rule.id === updated.id) ?? updated;
        await applyRuleCategoryToRows(nextRule, previousCategoryId);
        toast.success(m.bank_review_rule_updated());
        return;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    // Learn silently from explicit user category picks to reduce manual rule work.
    await captureRuleForRow(patchedRow, previousCategoryId);
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
          rule.category_id === row.selected_category_id && matchCategory(row, [rule], cats) !== null
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

  // Exception-review surface (issue #66 + #73): rows arrive already decided by the
  // deterministic engine (import / duplicate). Do NOT flip them to "pending" - clean
  // imports stay one-click committable, and uncategorized rows flow to the user's
  // "Inne" default via the confirm sheet. "pending" is reserved for rows a user
  // explicitly defers (skip / duplicate restore actions). On first load just pick a
  // sensible filter: lead with the exception bucket only when something awaits a
  // decision, otherwise show everything (avoids an empty "Do decyzji" first screen).
  $effect(() => {
    if (queueInitialized) return;
    if (rows.length === 0) return;
    queueInitialized = true;
    filter = pendingRows.length > 0 ? "pending" : "all";
  });

  async function saveRuleEditor(): Promise<void> {
    if (!editingRule) return;

    const hasTextConstraint = editDescEnabled || editCounterpartyEnabled;
    if (!hasTextConstraint) {
      toast.error(m.bank_review_rule_edit_require_condition());
      return;
    }

    const nextDesc = editDescEnabled ? editDesc.trim() : null;
    const nextCounterparty = editCounterpartyEnabled ? editCounterparty.trim() : null;
    if (hasTextConstraint && !nextDesc && !nextCounterparty) {
      toast.error(m.bank_review_rule_edit_require_text());
      return;
    }

    const nextKind: "contains" | "exact" = editingRule.kind === "exact" ? "exact" : "contains";
    const nextDayOfMonth: number | null = editDateEnabled ? Number(editDayOfMonth) : null;
    if (
      editDateEnabled &&
      (nextDayOfMonth === null ||
        !Number.isInteger(nextDayOfMonth) ||
        nextDayOfMonth < 1 ||
        nextDayOfMonth > 31)
    ) {
      toast.error(m.bank_review_rule_edit_require_date());
      return;
    }

    editRuleSaving = true;
    try {
      const previousRule = editingRule;
      await updateCategorizationRule(previousRule.id, {
        kind: nextKind,
        match_description: nextDesc,
        match_counterparty: nextCounterparty,
        match_type: null,
        match_day_of_month: nextDayOfMonth,
      });
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
      onCommitted(result, getImportedDateRange());
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
    if (needsConfirm) confirmOpen = true;
    else commitMut.mutate();
  }

  function confirmCommit(): void {
    confirmOpen = false;
    commitMut.mutate();
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
      <Check size={14} aria-hidden="true" />
      <span class="hidden md:inline">{m.bank_review_decision_import()}</span>
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
      <X size={14} aria-hidden="true" />
      <span class="hidden md:inline">{m.bank_review_decision_skip()}</span>
    </button>
  </div>
{/snippet}

<div class="space-y-4">
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
    {spanNudge}
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
      filter = "all";
    }}
    onBulkImportVisible={() => void bulkImportVisible()}
    onBulkRestoreVisible={() => void bulkRestoreVisible()}
    onPatchRow={(id, patch) => void patchRow(id, patch)}
    onCategoryChange={(row, id) => void handleRowCategoryChange(row, id)}
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
        disabled={importRows.length === 0 || pendingRows.length > 0 || commitMut.isPending}
        loading={commitMut.isPending}
        onclick={commitOrConfirm}
      >
        {m.bank_review_commit_action({ count: importRows.length })}
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
  commitPending={commitMut.isPending}
  onClose={() => (confirmOpen = false)}
  onCommit={confirmCommit}
  onSkipInne={() => void skipInneAndCommit()}
/>

<Dialog open={editRuleOpen} onclose={closeRuleEditor} title={m.bank_review_rule_edit()}>
  <div class="space-y-3">
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
