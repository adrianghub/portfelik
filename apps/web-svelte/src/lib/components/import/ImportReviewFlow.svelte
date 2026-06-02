<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import DuplicateBanner from "$lib/components/import/DuplicateBanner.svelte";
  import ImportReviewCategorizeStep from "$lib/components/import/ImportReviewCategorizeStep.svelte";
  import ImportConfirmSheet from "$lib/components/import/ImportConfirmSheet.svelte";
  import Button from "$lib/components/ui/Button.svelte";
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

  type FilterKind = "all" | "uncategorized" | "income" | "expense";

  const queryClient = useQueryClient();
  const rowsKey = $derived(["import_session_rows", session.id]);

  let filter = $state<FilterKind>("all");
  let ruleSaving = $state(false);
  let confirmOpen = $state(false);

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

  // activeRows = rows the user is deciding on (not auto-skipped duplicates).
  const activeRows = $derived(rows.filter((r) => r.decision !== "duplicate"));
  const importRows = $derived(rows.filter((r) => r.decision === "import"));
  const skippedRows = $derived(rows.filter((r) => r.decision === "skip"));
  const duplicateRows = $derived(rows.filter((r) => r.decision === "duplicate"));
  const uncategorizedImportRows = $derived(
    importRows.filter((r) => r.selected_category_id == null)
  );

  const filterCounts = $derived({
    all: activeRows.length,
    uncategorized: activeRows.filter((r) => r.selected_category_id == null).length,
    income: activeRows.filter((r) => r.type === "income").length,
    expense: activeRows.filter((r) => r.type === "expense").length,
  });

  const visibleRows = $derived.by(() => {
    switch (filter) {
      case "uncategorized":
        return activeRows.filter((r) => r.selected_category_id == null);
      case "income":
        return activeRows.filter((r) => r.type === "income");
      case "expense":
        return activeRows.filter((r) => r.type === "expense");
      default:
        return activeRows;
    }
  });

  // Bulk actions are BOTH scoped to the current filter (visibleRows).
  const bulkSkippableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision === "import").length
  );
  const bulkRestorableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision === "skip").length
  );

  const inneRows = $derived(uncategorizedImportRows);
  const needsConfirm = $derived(inneRows.length > 0 || duplicateRows.length > 0);

  const filterOptions: { kind: FilterKind; label: string }[] = $derived([
    { kind: "all", label: m.bank_review_filter_all() },
    { kind: "uncategorized", label: m.bank_review_filter_uncategorized() },
    { kind: "income", label: m.bank_review_filter_income() },
    { kind: "expense", label: m.bank_review_filter_expense() },
  ]);

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

  async function toggleSkip(row: ImportRow): Promise<void> {
    await patchRow(row.id, { decision: row.decision === "skip" ? "import" : "skip" });
  }

  async function bulkSkipVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision === "import");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  async function bulkRestoreVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision === "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "import" })));
  }

  function needsRule(row: ImportRow): boolean {
    return row.selected_category_id != null && matchedRuleFor(row) == null;
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
    const results = await Promise.allSettled(
      targets.map((r) => patchRow(r.id, { selected_category_id: created.category_id }))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(m.toast_error());

    const toastMsg =
      targets.length > 0
        ? m.bank_review_save_rule_success({ count: targets.length })
        : m.bank_review_save_rule_success_solo();
    toast.success(toastMsg, {
      action: {
        label: m.common_undo(),
        onClick: () => void undoSavedRule(created.id, snapshots, created.category_id),
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
    await patchRow(row.id, { decision: "import" });
  }

  async function restoreAllDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => r.decision === "duplicate");
    await Promise.all(flagged.map((r) => patchRow(r.id, { decision: "import" })));
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
</script>

{#snippet decisionControl(row: ImportRow)}
  <button
    type="button"
    class={cn(
      "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
      row.decision === "skip"
        ? "border-white/10 text-slate-400 hover:bg-white/5"
        : "border-accent/40 bg-accent/15 text-accent"
    )}
    aria-pressed={row.decision !== "skip"}
    aria-label={m.bank_review_import_aria_label({
      description: row.counterparty ?? row.edited_description ?? row.description,
    })}
    onclick={() => void toggleSkip(row)}
  >
    {row.decision === "skip" ? m.bank_review_row_restore() : m.bank_review_row_skip()}
  </button>
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
    {warningsByRow}
    onImportAnyway={(row) => void importDuplicateAnyway(row)}
    onRestoreAll={() => void restoreAllDuplicates()}
  />

  <ImportReviewCategorizeStep
    {parseErrorCount}
    largeRowCount={rows.length}
    {bulkSkippableVisibleCount}
    {bulkRestorableVisibleCount}
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
    onBulkSkipVisible={() => void bulkSkipVisible()}
    onBulkRestoreVisible={() => void bulkRestoreVisible()}
    onSaveSuggestion={(s) => void saveSuggestion(s)}
    onQuickSaveRule={(row) => void quickSaveRule(row)}
    onPatchRow={(id, patch) => void patchRow(id, patch)}
    onOpenRuleSettings={openRuleInSettings}
    {decisionControl}
  />

  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3 pb-(--mobile-action-bottom) backdrop-blur md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
  >
    <div class="min-w-0 text-xs text-slate-400">
      {#if importRows.length === 0}
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
        disabled={importRows.length === 0 || commitMut.isPending}
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
/>
