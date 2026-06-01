<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import ImportReviewDuplicatesStep from "$lib/components/import/ImportReviewDuplicatesStep.svelte";
  import ImportReviewCategorizeStep from "$lib/components/import/ImportReviewCategorizeStep.svelte";
  import ImportReviewFinalizeStep from "$lib/components/import/ImportReviewFinalizeStep.svelte";
  import { goto } from "$app/navigation";
  import { createCategory, fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    createCategorizationRule,
    deleteCategorizationRule,
    fetchCategorizationRules,
  } from "$lib/services/categorization-rules";
  import {
    findDuplicateCategorizationRule,
    matchCategory,
    resolveCategorizationRule,
    suggestRuleText,
  } from "$lib/import/categorize";
  import type { CategorizationRule, Category, TransactionType } from "$lib/types";
  import {
    commitImportSession,
    fetchBankAccount,
    fetchSessionRows,
    previewFingerprintWarnings,
    updateRowDecision,
    type CommitResult,
    type ImportRow,
    type ImportSession,
    type RowDecision,
  } from "$lib/services/bank-import";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    session: ImportSession;
    parseErrorCount?: number;
    onCommitted: (result: CommitResult, dateRange?: ImportedDateRange) => void;
    onCancel: () => Promise<void> | void;
  }
  let { session, parseErrorCount = 0, onCommitted, onCancel }: Props = $props();

  interface ImportedDateRange {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }

  type ReviewStep = "duplicates" | "categorize" | "finalize";
  type FilterKind = "pending" | "all" | "income" | "expense";

  const queryClient = useQueryClient();
  const rowsKey = $derived(["import_session_rows", session.id]);

  let reviewStep = $state<ReviewStep>("duplicates");
  let filter = $state<FilterKind>("pending");
  let ruleSaving = $state(false);
  /** Bumped when the user overrides an auto-duplicate mark so stale in-flight updates abort. */
  const dupMarkEpoch: Record<string, number> = {};
  /** Row ids with an in-flight auto-mark request (reactive for duplicate-step UI). */
  let autoDupInflightIds = $state<Set<string>>(new Set());
  const autoDupPromises = new Map<string, Promise<void>>();
  /** Permanent guard: row was auto-marked once; restore must not re-trigger auto-mark. */
  let autoDupHandledIds = $state<Set<string>>(new Set());

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

  const warningsQuery = createQuery(() => ({
    queryKey: ["import_preview_warnings", session.id],
    queryFn: () => previewFingerprintWarnings(session.id),
  }));

  const accountQuery = createQuery(() => ({
    queryKey: ["bank_account", session.bank_account_id],
    queryFn: () => fetchBankAccount(session.bank_account_id),
  }));

  const warningsByRow = $derived(new Map((warningsQuery.data ?? []).map((w) => [w.row_id, w])));
  const rows = $derived<ImportRow[]>(rowsQuery.data ?? []);

  /** Rows that still need categorization / import-skip decisions. */
  const activeRows = $derived(rows.filter((r) => r.decision !== "duplicate"));

  const flaggedRows = $derived(
    rows.filter((r) => warningsByRow.has(r.id)).sort((a, b) => a.row_index - b.row_index)
  );

  const pendingCount = $derived(activeRows.filter((r) => r.decision === "pending").length);
  const canProceedCategorize = $derived(activeRows.length === 0 || pendingCount === 0);

  const importRows = $derived(rows.filter((r) => r.decision === "import"));
  const skippedRows = $derived(rows.filter((r) => r.decision === "skip"));
  const duplicateRows = $derived(rows.filter((r) => r.decision === "duplicate"));

  const uncategorizedImportRows = $derived(
    importRows.filter((r) => r.selected_category_id == null)
  );

  const filterCounts = $derived({
    pending: activeRows.filter((r) => r.decision === "pending").length,
    all: activeRows.length,
    income: activeRows.filter((r) => r.type === "income").length,
    expense: activeRows.filter((r) => r.type === "expense").length,
  });

  const visibleRows = $derived.by(() => {
    switch (filter) {
      case "pending":
        return activeRows.filter((r) => r.decision === "pending");
      case "income":
        return activeRows.filter((r) => r.type === "income");
      case "expense":
        return activeRows.filter((r) => r.type === "expense");
      default:
        return activeRows;
    }
  });

  const bulkImportableCount = $derived(
    activeRows.filter((r) => r.selected_category_id !== null && r.decision !== "import").length
  );

  const bulkSkippableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision !== "skip").length
  );

  const reviewSteps: { id: ReviewStep; label: string }[] = $derived([
    { id: "duplicates", label: m.bank_import_review_step_duplicates() },
    { id: "categorize", label: m.bank_import_review_step_categorize() },
    { id: "finalize", label: m.bank_import_review_step_finalize() },
  ]);

  const stepIndex = $derived(reviewSteps.findIndex((s) => s.id === reviewStep));

  const dupActionsReady = $derived(
    !warningsQuery.isLoading && !rowsQuery.isLoading && autoDupInflightIds.size === 0
  );

  function dupEpoch(rowId: string): number {
    return dupMarkEpoch[rowId] ?? 0;
  }

  function isDupEpochCurrent(rowId: string, epoch: number): boolean {
    return dupEpoch(rowId) === epoch;
  }

  function bumpDupMarkEpoch(rowId: string): void {
    dupMarkEpoch[rowId] = dupEpoch(rowId) + 1;
  }

  function isRowAutoDupSettled(rowId: string): boolean {
    return !autoDupInflightIds.has(rowId);
  }

  async function waitForAutoDupMark(rowId?: string): Promise<void> {
    if (rowId) {
      await autoDupPromises.get(rowId);
      return;
    }
    await Promise.all([...autoDupPromises.values()]);
  }

  function getRowSnapshot(rowId: string): ImportRow | undefined {
    return queryClient.getQueryData<ImportRow[]>(rowsKey)?.find((r) => r.id === rowId);
  }

  /** If a stale auto-mark landed on the server, re-apply the user's current decision. */
  async function resyncRowDecisionIfStale(rowId: string, epoch: number): Promise<void> {
    if (isDupEpochCurrent(rowId, epoch)) return;
    const current = getRowSnapshot(rowId);
    if (!current) return;
    await updateRowDecision(rowId, { decision: current.decision });
  }

  // Auto-mark probable duplicates on the duplicates step only. Serialized per row;
  // permanent handled-id prevents re-mark after restore; epoch blocks stale RPC wins.
  $effect(() => {
    if (reviewStep !== "duplicates") return;
    if (warningsQuery.isLoading || rowsQuery.isLoading) return;
    for (const row of rows) {
      if (!warningsByRow.has(row.id)) continue;
      if (row.decision !== "pending") continue;
      if (autoDupHandledIds.has(row.id)) continue;
      void scheduleAutoMarkDuplicate(row);
    }
  });

  async function scheduleAutoMarkDuplicate(row: ImportRow): Promise<void> {
    if (autoDupPromises.has(row.id)) return autoDupPromises.get(row.id)!;

    autoDupHandledIds = new Set(autoDupHandledIds).add(row.id);
    const epoch = dupEpoch(row.id);
    autoDupInflightIds = new Set(autoDupInflightIds).add(row.id);

    const promise = patchRow(row.id, { decision: "duplicate" }, { autoDupEpoch: epoch })
      .catch(() => {
        /* patchRow surfaces errors */
      })
      .finally(() => {
        const next = new Set(autoDupInflightIds);
        next.delete(row.id);
        autoDupInflightIds = next;
        autoDupPromises.delete(row.id);
      });

    autoDupPromises.set(row.id, promise);
    return promise;
  }
  function bankKindLabel(kind: string): string {
    return kind === "ing" ? m.bank_account_kind_ing() : m.bank_account_kind_mbank();
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

  function categoryName(id: string | null): string | null {
    if (!id) return null;
    return (categoriesQuery.data ?? []).find((c) => c.id === id)?.name ?? null;
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

  async function patchRow(
    rowId: string,
    patch: Partial<ImportRow>,
    opts?: { autoDupEpoch?: number }
  ): Promise<void> {
    if (opts?.autoDupEpoch !== undefined && !isDupEpochCurrent(rowId, opts.autoDupEpoch)) {
      return;
    }

    if (patch.decision !== undefined && patch.decision !== "duplicate") {
      bumpDupMarkEpoch(rowId);
    }
    const previous = queryClient.getQueryData<ImportRow[]>(rowsKey);
    const effective: Partial<ImportRow> = patch;

    if (previous) {
      queryClient.setQueryData<ImportRow[]>(
        rowsKey,
        previous.map((r) => (r.id === rowId ? { ...r, ...effective } : r))
      );
    }
    try {
      await updateRowDecision(rowId, {
        decision: effective.decision,
        selectedCategoryId:
          effective.selected_category_id === undefined ? undefined : effective.selected_category_id,
        selectedGroupId:
          effective.selected_group_id === undefined ? undefined : effective.selected_group_id,
        editedDescription:
          effective.edited_description === undefined ? undefined : effective.edited_description,
        duplicateOf: effective.duplicate_of === undefined ? undefined : effective.duplicate_of,
      });
      if (opts?.autoDupEpoch !== undefined) {
        await resyncRowDecisionIfStale(rowId, opts.autoDupEpoch);
      }
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

  async function setDecision(row: ImportRow, decision: "import" | "skip"): Promise<void> {
    if (row.decision === decision) return;
    await patchRow(row.id, { decision });
  }

  function needsRule(row: ImportRow): boolean {
    return row.selected_category_id != null && matchedRuleFor(row) == null;
  }

  function ruleGroupKey(row: ImportRow): string {
    return `${row.type}:${suggestRuleText(row).toLowerCase()}:${row.selected_category_id}`;
  }

  async function ensureRulesThenImport(targets: ImportRow[]): Promise<void> {
    const captureOk = new Map<string, boolean>();
    for (const row of targets) {
      if (!needsRule(row)) continue;
      const key = ruleGroupKey(row);
      if (captureOk.has(key)) continue;
      captureOk.set(key, await captureRuleForRow(row));
    }
    const importable = targets.filter(
      (row) => !needsRule(row) || captureOk.get(ruleGroupKey(row)) === true
    );
    await Promise.all(importable.map((r) => setDecision(r, "import")));
  }

  async function markImport(row: ImportRow): Promise<void> {
    await ensureRulesThenImport([row]);
  }

  async function bulkImportValid(): Promise<void> {
    const targets = activeRows.filter(
      (r) => r.selected_category_id !== null && r.decision !== "import"
    );
    await ensureRulesThenImport(targets);
  }

  async function bulkSkipVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision !== "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  interface RuleSuggestion {
    key: string;
    text: string;
    categoryId: string;
    categoryName: string;
    count: number;
  }

  interface UndoSnapshot {
    id: string;
    selected_category_id: string | null;
    decision: RowDecision;
  }

  function matchingUncategorizedRows(rule: CategorizationRule): ImportRow[] {
    const cats = categoriesQuery.data ?? [];
    return activeRows.filter(
      (r) => r.selected_category_id == null && matchCategory(r, [rule], cats) !== null
    );
  }

  async function undoSavedRule(ruleId: string, changedRows: UndoSnapshot[]): Promise<void> {
    try {
      await deleteCategorizationRule(ruleId);
      await Promise.all(
        changedRows.map((row) =>
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
  }): Promise<CategorizationRule> {
    const text = input.text.trim();
    const candidate = {
      id: "__draft__",
      user_id: "__draft__",
      kind: input.kind,
      match_description: text,
      match_counterparty: text,
      match_type: null,
      category_id: input.categoryId,
      priority: 0,
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
    });
    await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });

    const targets = matchingUncategorizedRows(created);
    const snapshots = targets.map((r) => ({
      id: r.id,
      selected_category_id: r.selected_category_id,
      decision: r.decision,
    }));
    await Promise.all(
      targets.map((r) => patchRow(r.id, { selected_category_id: created.category_id }))
    );

    const toastMsg =
      targets.length > 0
        ? m.bank_review_save_rule_success({ count: targets.length })
        : m.bank_review_save_rule_success_solo();
    toast.success(toastMsg, {
      action: {
        label: m.common_undo(),
        onClick: () => void undoSavedRule(created.id, snapshots),
      },
      duration: 8000,
    });

    return created;
  }

  async function captureRuleForRow(row: ImportRow): Promise<boolean> {
    if (!row.selected_category_id) return false;
    const text = suggestRuleText(row);
    if (text === "") return false;
    ruleSaving = true;
    try {
      await createAndApplyRule({
        kind: "contains",
        categoryId: row.selected_category_id,
        text,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "duplicate_categorization_rule") {
        toast.info(m.bank_review_rule_already_saved());
        return true;
      }
      toast.error(msg);
      return false;
    } finally {
      ruleSaving = false;
    }
  }

  async function quickSaveRule(row: ImportRow): Promise<void> {
    await captureRuleForRow(row);
  }

  function categoryById(id: string | null | undefined): Category | null {
    if (!id) return null;
    return (categoriesQuery.data ?? []).find((c) => c.id === id) ?? null;
  }

  function buildRuleSuggestions(): RuleSuggestion[] {
    const groups = new Map<
      string,
      {
        text: string;
        type: "income" | "expense";
        rows: ImportRow[];
        categoryCounts: Map<string, number>;
      }
    >();

    for (const row of activeRows) {
      const text = suggestRuleText(row);
      if (text === "") continue;
      const key = `${row.type}:${text.toLowerCase()}`;
      const group = groups.get(key) ?? {
        text,
        type: row.type,
        rows: [],
        categoryCounts: new Map<string, number>(),
      };
      group.rows.push(row);
      if (row.selected_category_id && categoryById(row.selected_category_id)?.type === row.type) {
        group.categoryCounts.set(
          row.selected_category_id,
          (group.categoryCounts.get(row.selected_category_id) ?? 0) + 1
        );
      }
      groups.set(key, group);
    }

    return [...groups.entries()]
      .flatMap(([key, group]) => {
        if (group.rows.length < 3 || group.categoryCounts.size === 0) return [];
        const [categoryId] = [...group.categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        const category = categoryById(categoryId);
        if (!category) return [];
        const candidate = {
          id: "__suggestion__",
          user_id: "__suggestion__",
          kind: "contains",
          match_description: group.text,
          match_counterparty: group.text,
          match_type: null,
          category_id: categoryId,
          priority: 0,
          created_at: "",
        } satisfies CategorizationRule;
        if (findDuplicateCategorizationRule(rulesQuery.data ?? [], candidate)) return [];
        return [
          {
            key,
            text: group.text,
            categoryId,
            categoryName: category.name,
            count: group.rows.length,
          },
        ];
      })
      .slice(0, 3);
  }

  const ruleSuggestions = $derived.by(buildRuleSuggestions);

  async function saveSuggestion(suggestion: RuleSuggestion): Promise<void> {
    ruleSaving = true;
    try {
      await createAndApplyRule({
        kind: "contains",
        categoryId: suggestion.categoryId,
        text: suggestion.text,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.info(
        msg === "duplicate_categorization_rule" ? m.bank_review_rule_already_saved() : msg
      );
    } finally {
      ruleSaving = false;
    }
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
    const matched = resolveCategorizationRule(
      row,
      rulesQuery.data ?? [],
      categoriesQuery.data ?? []
    );
    if (!matched) return null;
    if (matched.category_id !== row.selected_category_id) return null;
    return matched;
  }

  function ruleAttributionText(rule: {
    match_counterparty: string | null;
    match_description: string | null;
  }): string {
    return rule.match_counterparty ?? rule.match_description ?? "";
  }

  function openRuleInSettings(ruleId: string): void {
    void goto(`/settings?tab=rules&highlight=${encodeURIComponent(ruleId)}`);
  }

  async function importDuplicateAnyway(row: ImportRow): Promise<void> {
    await waitForAutoDupMark(row.id);
    bumpDupMarkEpoch(row.id);
    await patchRow(row.id, { decision: "import" });
  }

  async function restoreAllDuplicates(): Promise<void> {
    await waitForAutoDupMark();
    const flagged = rows.filter((r) => warningsByRow.has(r.id) && r.decision === "duplicate");
    for (const r of flagged) {
      bumpDupMarkEpoch(r.id);
      await patchRow(r.id, { decision: "pending" });
    }
  }

  function goToStep(step: ReviewStep): void {
    const targetIdx = reviewSteps.findIndex((s) => s.id === step);
    const currentIdx = stepIndex;
    if (targetIdx > currentIdx) {
      if (step === "categorize" && reviewStep === "duplicates") reviewStep = "categorize";
      else if (step === "finalize" && reviewStep === "categorize" && canProceedCategorize)
        reviewStep = "finalize";
      return;
    }
    reviewStep = step;
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

  const filterOptions: { kind: FilterKind; label: string }[] = $derived([
    { kind: "pending", label: m.bank_review_filter_pending() },
    { kind: "all", label: m.bank_review_filter_all() },
    { kind: "income", label: m.bank_review_filter_income() },
    { kind: "expense", label: m.bank_review_filter_expense() },
  ]);
</script>

{#snippet decisionControl(row: ImportRow)}
  <div class="inline-flex overflow-hidden rounded-lg border border-white/10" role="group">
    <button
      type="button"
      class={cn(
        "px-2.5 py-1 text-xs font-medium transition-colors",
        row.decision === "import" ? "bg-accent/20 text-accent" : "text-slate-400 hover:bg-white/5"
      )}
      aria-pressed={row.decision === "import"}
      onclick={() => void markImport(row)}
    >
      {m.bank_review_decision_import()}
    </button>
    <button
      type="button"
      class={cn(
        "border-l border-white/10 px-2.5 py-1 text-xs font-medium transition-colors",
        row.decision === "skip"
          ? "bg-slate-700/70 text-slate-200"
          : "text-slate-400 hover:bg-white/5"
      )}
      aria-pressed={row.decision === "skip"}
      onclick={() => void setDecision(row, "skip")}
    >
      {m.bank_review_decision_skip()}
    </button>
  </div>
{/snippet}

<div class="space-y-4">
  <ol
    class="flex flex-wrap items-center gap-2 text-xs text-slate-400"
    aria-label={m.bank_import_step_review()}
  >
    {#each reviewSteps as s, i (s.id)}
      {@const active = reviewStep === s.id}
      {@const completed = stepIndex > i}
      {@const canClick = completed || active}
      <li>
        <button
          type="button"
          disabled={!canClick}
          class={cn(
            "rounded-full border px-3 py-1 transition-colors",
            active && "border-accent text-accent",
            completed &&
              !active &&
              "border-accent/40 text-accent/70 hover:border-accent hover:text-accent",
            !active && !completed && "border-white/10 text-slate-500",
            !canClick && "cursor-default opacity-60"
          )}
          onclick={() => canClick && goToStep(s.id)}
        >
          {s.label}
        </button>
      </li>
      {#if i < reviewSteps.length - 1}
        <span class="text-slate-600" aria-hidden="true">›</span>
      {/if}
    {/each}
  </ol>

  {#if reviewStep === "duplicates"}
    <ImportReviewDuplicatesStep
      loading={warningsQuery.isLoading}
      {flaggedRows}
      {warningsByRow}
      {duplicateDetail}
      {dupActionsReady}
      {isRowAutoDupSettled}
      onImportAnyway={(row) => void importDuplicateAnyway(row)}
      onRestoreAll={() => void restoreAllDuplicates()}
      onNext={() => goToStep("categorize")}
    />
  {:else if reviewStep === "categorize"}
    <ImportReviewCategorizeStep
      {parseErrorCount}
      largeRowCount={rows.length}
      {pendingCount}
      {bulkImportableCount}
      {bulkSkippableVisibleCount}
      {filter}
      {filterCounts}
      {filterOptions}
      {visibleRows}
      totalActiveRows={activeRows.length}
      {ruleSuggestions}
      {ruleSaving}
      groups={groupsQuery.data ?? []}
      {categoriesFor}
      {createCategoryInline}
      {needsRule}
      {matchedRuleFor}
      {ruleAttributionText}
      onFilterChange={(k) => (filter = k)}
      onClearFilter={() => (filter = "all")}
      onBulkImport={() => void bulkImportValid()}
      onBulkSkipVisible={() => void bulkSkipVisible()}
      onSaveSuggestion={(s) => void saveSuggestion(s)}
      onQuickSaveRule={(row) => void quickSaveRule(row)}
      onPatchRow={(id, patch) => void patchRow(id, patch)}
      onOpenRuleSettings={openRuleInSettings}
      {decisionControl}
      onBack={() => goToStep("duplicates")}
      onNext={() => goToStep("finalize")}
      onCancel={() => void onCancel()}
      canProceed={canProceedCategorize}
    />
  {:else}
    <ImportReviewFinalizeStep
      account={accountQuery.data}
      {bankKindLabel}
      {importRows}
      {skippedRows}
      {duplicateRows}
      {categoryName}
      uncategorizedImportCount={uncategorizedImportRows.length}
      commitPending={commitMut.isPending}
      onBack={() => goToStep("categorize")}
      onCommit={() => commitMut.mutate()}
      onCancel={() => void onCancel()}
    />
  {/if}
</div>
