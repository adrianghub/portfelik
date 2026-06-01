<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import ImportCategoryCombobox from "$lib/components/import/ImportCategoryCombobox.svelte";
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
  import { BookmarkPlus } from "lucide-svelte";

  interface Props {
    session: ImportSession;
    /** Count of CSV rows the adapter could not parse — surfaced as a non-blocking banner. */
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

  const LARGE_THRESHOLD = 500;
  const queryClient = useQueryClient();

  const rowsKey = $derived(["import_session_rows", session.id]);

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

  const warningsByRow = $derived(new Map((warningsQuery.data ?? []).map((w) => [w.row_id, w])));

  // Destination account — surfaced in the final confirmation dialog so the
  // user always knows which bank account the import will post to.
  const accountQuery = createQuery(() => ({
    queryKey: ["bank_account", session.bank_account_id],
    queryFn: () => fetchBankAccount(session.bank_account_id),
  }));

  function bankKindLabel(kind: string): string {
    return kind === "ing" ? m.bank_account_kind_ing() : m.bank_account_kind_mbank();
  }

  const rows = $derived<ImportRow[]>(rowsQuery.data ?? []);
  const pendingCount = $derived(rows.filter((r) => r.decision === "pending").length);
  const canCommit = $derived(rows.length > 0 && pendingCount === 0);

  // "Do decyzji" (pending) leads the funnel; the legacy "bez kategorii" filter
  // is dropped — uncategorized rows now fall back to "Inne" at import (issue #66).
  type FilterKind = "pending" | "all" | "income" | "expense";
  let filter = $state<FilterKind>("pending");
  let focusedRowId = $state<string | null>(null);
  let confirmOpen = $state(false);

  const filterCounts = $derived({
    pending: rows.filter((r) => r.decision === "pending").length,
    all: rows.length,
    income: rows.filter((r) => r.type === "income").length,
    expense: rows.filter((r) => r.type === "expense").length,
  });

  const visibleRows = $derived.by(() => {
    switch (filter) {
      case "pending":
        return rows.filter((r) => r.decision === "pending");
      case "income":
        return rows.filter((r) => r.type === "income");
      case "expense":
        return rows.filter((r) => r.type === "expense");
      default:
        return rows;
    }
  });

  function categoriesFor(type: "income" | "expense") {
    return (categoriesQuery.data ?? []).filter((c) => c.type === type);
  }

  // Inline category creation from the per-row combobox: create, refresh the
  // cache, and hand the new id back so the row can select it immediately.
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

  // Final-confirmation digest: only the rows that will actually become
  // transactions, plus a flag for any probable duplicates still set to import.
  const importRows = $derived(rows.filter((r) => r.decision === "import"));
  const skippedRows = $derived(rows.filter((r) => r.decision === "skip"));
  const skipCount = $derived(skippedRows.length);
  const dupAmongImport = $derived(importRows.filter((r) => warningsByRow.has(r.id)).length);
  // Import rows left uncategorized go to the per-user "Inne" fallback at commit.
  const uncategorizedImportRows = $derived(
    importRows.filter((r) => r.selected_category_id == null)
  );

  /**
   * Optimistic patch of a single row. The import/ignore decision is now an
   * explicit step (issue #66) — categorizing a row no longer auto-flips it to
   * import, so the rule-capture requirement can't be bypassed.
   */
  async function patchRow(rowId: string, patch: Partial<ImportRow>): Promise<void> {
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

  // Explicit per-row decision (issue #66): the import/ignore call is its own
  // control instead of a checkbox. Importuj keeps an uncategorized row (it falls
  // back to "Inne" at commit); Pomiń ignores it. Promotion of pending → import on
  // category set is still handled in patchRow for sweep-by-category ergonomics.
  async function setDecision(row: ImportRow, decision: "import" | "skip"): Promise<void> {
    if (row.decision === decision) return;
    await patchRow(row.id, { decision });
  }

  // A manually categorized row (category not produced by an existing rule) must
  // capture a rule before it can be imported (issue #66). Uncategorized rows are
  // exempt — they fall back to "Inne" at commit.
  function needsRule(row: ImportRow): boolean {
    return row.selected_category_id != null && matchedRuleFor(row) == null;
  }

  function ruleGroupKey(row: ImportRow): string {
    return `${row.type}:${suggestRuleText(row).toLowerCase()}:${row.selected_category_id}`;
  }

  // Capture any required rules (once per distinct merchant token + category),
  // then mark for import ONLY the targets whose rule requirement is satisfied.
  // If a required rule fails to save (transient Supabase/RLS/network error), the
  // affected rows stay un-imported so the required-rule contract can't be
  // silently bypassed (issue #66).
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

  // Eligible = has a category but is not yet marked import. When zero, the
  // "import all with category" button is disabled (it would otherwise no-op
  // silently in the default, uncategorized state).
  const bulkImportableCount = $derived(
    rows.filter((r) => r.selected_category_id !== null && r.decision !== "import").length
  );

  async function bulkImportValid(): Promise<void> {
    const targets = rows.filter((r) => r.selected_category_id !== null && r.decision !== "import");
    await ensureRulesThenImport(targets);
  }

  // Probable-duplicate rows are flagged by the fingerprint preview. The user
  // sweeps them to 'skip' in one tap; true hard duplicates (external-id /
  // file-hash matches) are caught again at commit time by the RPC regardless.
  async function bulkSkipProbableDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => warningsByRow.has(r.id) && r.decision !== "skip");
    await Promise.all(flagged.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  // Bulk-ignore the rows currently in view (respects the active filter), so a
  // user can clear out a whole "do decyzji" batch they don't want to import.
  const bulkSkippableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision !== "skip").length
  );

  async function bulkSkipVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision !== "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  function clearFilter(): void {
    filter = "all";
  }

  // "Save as rule": turn a categorized row into a reusable categorization rule
  // so future imports pre-fill the same category. One-tap from the bookmark
  // icon: counterparty (when present) is the default match phrase, "contains"
  // is the default kind. Power-edits live in Settings → Reguły.
  let ruleSaving = $state(false);

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
    return rows.filter(
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
    // Auto-match both fields (issue #66): a saved rule matches whether the token
    // shows up in the bank "Kontrahent" (counterparty) or the description/content.
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

    toast.success(m.bank_review_save_rule_success({ count: targets.length }), {
      action: {
        label: m.common_undo(),
        onClick: () => void undoSavedRule(created.id, snapshots),
      },
      duration: 8000,
    });

    return created;
  }

  /**
   * Save the rule for a row's merchant/content and report whether the row's
   * rule requirement is now satisfied:
   *   * true  — rule created, or an equivalent rule already exists (duplicate);
   *   * false — no category / no derivable token, or a transient save failure.
   * Callers gate import on a `true` result so a failed save never lets a
   * required-rule row through un-ruled.
   */
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
        // Rule already exists — the requirement is met.
        toast.info(m.bank_review_rule_already_saved());
        return true;
      }
      // Transient/real failure — surface it and block import for this row.
      toast.error(msg);
      return false;
    } finally {
      ruleSaving = false;
    }
  }

  // Bookmark button: manual one-tap save-as-rule (result intentionally ignored).
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

    for (const row of rows) {
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

  // Row refs for arrow-key focus management on desktop table.
  let rowRefs = $state<Record<string, HTMLTableRowElement | null>>({});

  function focusRow(id: string): void {
    focusedRowId = id;
    const el = rowRefs[id];
    el?.focus();
  }

  function handleTableKeydown(e: KeyboardEvent): void {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    // Skip if focus is inside a field — let native form keys win.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "SELECT" || target.tagName === "INPUT")) return;
    if (visibleRows.length === 0) return;
    e.preventDefault();
    const currentIdx = focusedRowId ? visibleRows.findIndex((r) => r.id === focusedRowId) : -1;
    const nextIdx =
      e.key === "ArrowDown"
        ? Math.min(visibleRows.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
    focusRow(visibleRows[nextIdx].id);
  }

  // Inline attribution: when the currently selected category matches a
  // saved rule's category, surface the rule text so the user knows why the
  // row was pre-filled (and how to fix it).
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

<!-- Explicit import/ignore control, shared by the desktop table + mobile cards. -->
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
        row.decision === "skip" || row.decision === "duplicate"
          ? "bg-slate-700/70 text-slate-200"
          : "text-slate-400 hover:bg-white/5"
      )}
      aria-pressed={row.decision === "skip" || row.decision === "duplicate"}
      onclick={() => void setDecision(row, "skip")}
    >
      {m.bank_review_decision_skip()}
    </button>
  </div>
{/snippet}

<div class="space-y-4">
  {#if parseErrorCount > 0}
    <p
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      {m.bank_review_parse_errors_banner({ count: parseErrorCount })}
    </p>
  {/if}

  <!-- Warnings + bulk actions. One-time setup at the top of the list; scrolls
       away with the page so only the table header stays pinned. -->
  <div class="space-y-2">
    {#if rows.length > LARGE_THRESHOLD}
      <p
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        {m.bank_review_large_warning({ count: rows.length })}
      </p>
    {/if}

    {#if pendingCount > 0}
      <p
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        {m.bank_review_no_category_warning({ count: pendingCount })}
      </p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      {#if bulkImportableCount > 0}
        <Button variant="primary" size="sm" onclick={bulkImportValid}>
          {m.bank_review_ready_action({ count: bulkImportableCount })}
        </Button>
      {/if}
      {#if warningsByRow.size > 0}
        <Button variant="ghost" size="sm" onclick={bulkSkipProbableDuplicates}>
          {m.bank_review_skip_duplicates_action({ count: warningsByRow.size })}
        </Button>
      {/if}
      {#if bulkSkippableVisibleCount > 0}
        <Button variant="ghost" size="sm" onclick={bulkSkipVisible}>
          {m.bank_review_skip_visible_action({ count: bulkSkippableVisibleCount })}
        </Button>
      {/if}
    </div>
  </div>

  <!-- Sticky decision surface: rule suggestions + category/decision filters stay
       reachable while scrolling on desktop and mobile (issue #66). -->
  <div class="surface-hi sticky top-14 z-30 -mx-4 space-y-2 px-4 py-2">
    {#if ruleSuggestions.length > 0}
      <div class="flex gap-2 overflow-x-auto pb-1">
        {#each ruleSuggestions as suggestion (suggestion.key)}
          <button
            type="button"
            class="border-accent/25 bg-accent/10 hover:bg-accent/15 min-w-72 rounded-xl border px-3 py-2 text-left shadow-[0_0_24px_rgba(16,185,129,0.06)] transition-colors disabled:opacity-60"
            disabled={ruleSaving}
            onclick={() => void saveSuggestion(suggestion)}
          >
            <span class="text-accent block text-xs">
              {m.bank_review_rule_suggestion_intro({
                text: suggestion.text,
                count: suggestion.count,
              })}
            </span>
            <span class="mt-0.5 block truncate text-sm font-medium text-slate-100">
              {m.bank_review_rule_suggestion_action({
                category: suggestion.categoryName,
              })}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Filter chips: scroll horizontally on narrow screens. -->
    <div class="flex flex-wrap items-center gap-2 overflow-x-auto">
      {#each filterOptions as f (f.kind)}
        <button
          type="button"
          class={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            filter === f.kind
              ? "border-accent bg-accent/10 text-accent"
              : "border-white/10 text-slate-400 hover:bg-white/5"
          )}
          onclick={() => (filter = f.kind)}
        >
          {f.label}<span class="ml-1.5 text-slate-500">{filterCounts[f.kind]}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if visibleRows.length === 0 && rows.length > 0}
    <EmptyState title={m.bank_review_filter_empty_title()} body={m.bank_review_filter_empty_body()}>
      {#snippet action()}
        <Button variant="ghost" size="sm" onclick={clearFilter}>
          {m.bank_review_filter_clear()}
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <!-- Desktop: the page is the single scroll surface. The sticky filter bar
         above is the pinned decision surface, so the header scrolls with rows. -->
    <div class="hidden rounded-2xl border border-white/10 md:block">
      <table class="min-w-full divide-y divide-white/5 text-sm">
        <thead class="bg-slate-900 text-xs text-slate-400 uppercase">
          <tr>
            <th class="px-3 py-2 text-left">{m.bank_review_header_date()}</th>
            <th class="px-3 py-2 text-right">{m.bank_review_header_amount()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_description()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_category()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_group()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_import_header_label()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 bg-slate-950/40">
          {#each visibleRows as row, idx (row.id)}
            <tr
              bind:this={rowRefs[row.id]}
              tabindex={focusedRowId === row.id || (focusedRowId === null && idx === 0) ? 0 : -1}
              onfocus={() => (focusedRowId = row.id)}
              onkeydown={handleTableKeydown}
              class="focus-visible:ring-accent/50 focus:bg-white/5 focus:outline-none focus-visible:ring-2"
            >
              <td class="px-3 py-2 align-top whitespace-nowrap text-slate-300">{row.posted_at}</td>
              <td
                class="px-3 py-2 text-right align-top tabular-nums"
                class:text-rose-300={row.type === "expense"}
                class:text-emerald-300={row.type === "income"}
              >
                {row.type === "expense" ? "-" : "+"}{formatCurrency(row.amount, row.currency)}
              </td>
              <td class="max-w-xs px-3 py-2 align-top">
                {#if warningsByRow.has(row.id)}
                  <div class="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="overdue">{m.bank_review_probable_duplicate()}</Badge>
                    {#if row.decision !== "skip"}
                      <button
                        type="button"
                        class="text-xs text-amber-200 underline-offset-2 hover:underline"
                        onclick={() => void patchRow(row.id, { decision: "skip" })}
                      >
                        {m.bank_review_skip_inline_action()}
                      </button>
                    {/if}
                  </div>
                  <p class="truncate text-xs text-amber-200/80">{duplicateDetail(row.id)}</p>
                {/if}
                {#if row.counterparty}
                  <p class="text-sm font-medium text-slate-100">{row.counterparty}</p>
                  <p class="text-xs text-slate-400">{row.edited_description ?? row.description}</p>
                {:else}
                  <Input
                    value={row.edited_description ?? row.description}
                    onchange={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      void patchRow(row.id, {
                        edited_description: v === "" || v === row.description ? null : v,
                      });
                    }}
                  />
                {/if}
              </td>
              <td class="px-3 py-2 align-top">
                <div class="flex items-center gap-1">
                  <ImportCategoryCombobox
                    categories={categoriesFor(row.type)}
                    type={row.type}
                    selectedId={row.selected_category_id}
                    onchange={(id) => void patchRow(row.id, { selected_category_id: id })}
                    oncreate={createCategoryInline}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    class={needsRule(row) ? "text-amber-300 ring-1 ring-amber-400/40" : undefined}
                    title={needsRule(row)
                      ? m.bank_review_save_rule_required_tooltip()
                      : m.bank_review_save_rule_tooltip()}
                    disabled={!row.selected_category_id || ruleSaving}
                    onclick={() => void quickSaveRule(row)}
                  >
                    <BookmarkPlus size={16} aria-hidden="true" />
                  </Button>
                </div>
                {#if matchedRuleFor(row)}
                  {@const r = matchedRuleFor(row)}
                  {#if r}
                    <button
                      type="button"
                      class="text-accent/80 hover:text-accent mt-1 inline-flex max-w-full items-center truncate rounded-md text-xs hover:underline"
                      title={m.bank_review_row_rule_attribution_title()}
                      onclick={() => openRuleInSettings(r.id)}
                    >
                      {m.bank_review_row_rule_attribution({ text: ruleAttributionText(r) })}
                    </button>
                  {/if}
                {/if}
              </td>
              <td class="px-3 py-2 align-top">
                <Select
                  value={row.selected_group_id ?? ""}
                  onchange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    void patchRow(row.id, { selected_group_id: v === "" ? null : v });
                  }}
                >
                  <option value="">{m.bank_review_group_own()}</option>
                  {#each groupsQuery.data ?? [] as g (g.id)}
                    <option value={g.id}>{g.name}</option>
                  {/each}
                </Select>
              </td>
              <td class="px-3 py-2 align-top">
                <div class="flex flex-col items-start gap-1">
                  {@render decisionControl(row)}
                  {#if row.decision === "pending"}
                    <span class="text-xs text-amber-300"
                      >{m.bank_review_decision_pending_cue()}</span
                    >
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile: concise card list mirroring the transactions page. Each card
         carries the per-row category + decision selects; the group select is
         dropped on phones (a set group surfaces as a small badge instead). -->
    <ul class="space-y-1.5 md:hidden">
      {#each visibleRows as row (row.id)}
        {@const groupName = (groupsQuery.data ?? []).find(
          (g) => g.id === row.selected_group_id
        )?.name}
        {@const secondary = row.counterparty ? (row.edited_description ?? row.description) : null}
        <li
          class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3 backdrop-blur"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="min-w-0 flex-1 truncate text-sm leading-snug font-medium text-slate-100">
              {row.counterparty ?? row.edited_description ?? row.description}
            </span>
            <span
              class={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                row.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-500">{row.posted_at}</span>
            {#if secondary}
              <span class="min-w-0 flex-1 truncate text-xs text-slate-500">· {secondary}</span>
            {/if}
            {#if groupName}
              <Badge variant="shared">{groupName}</Badge>
            {/if}
            {#if warningsByRow.has(row.id)}
              <Badge variant="overdue">{m.bank_review_probable_duplicate()}</Badge>
              {#if row.decision !== "skip"}
                <button
                  type="button"
                  class="text-xs text-amber-200 underline-offset-2 hover:underline"
                  onclick={() => void patchRow(row.id, { decision: "skip" })}
                >
                  {m.bank_review_skip_inline_action()}
                </button>
              {/if}
            {/if}
          </div>

          {#if warningsByRow.has(row.id)}
            <p class="truncate text-xs text-amber-200/80">{duplicateDetail(row.id)}</p>
          {/if}

          <div class="grid grid-cols-2 gap-2">
            <div class="flex min-w-0 flex-col gap-0.5">
              <div class="flex min-w-0 items-center gap-1">
                <ImportCategoryCombobox
                  categories={categoriesFor(row.type)}
                  type={row.type}
                  selectedId={row.selected_category_id}
                  onchange={(id) => void patchRow(row.id, { selected_category_id: id })}
                  oncreate={createCategoryInline}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  class={needsRule(row) ? "text-amber-300 ring-1 ring-amber-400/40" : undefined}
                  title={needsRule(row)
                    ? m.bank_review_save_rule_required_tooltip()
                    : m.bank_review_save_rule_tooltip()}
                  disabled={!row.selected_category_id || ruleSaving}
                  onclick={() => void quickSaveRule(row)}
                >
                  <BookmarkPlus size={16} aria-hidden="true" />
                </Button>
              </div>
              {#if matchedRuleFor(row)}
                {@const r = matchedRuleFor(row)}
                {#if r}
                  <button
                    type="button"
                    class="text-accent/80 hover:text-accent truncate text-left text-xs hover:underline"
                    title={m.bank_review_row_rule_attribution_title()}
                    onclick={() => openRuleInSettings(r.id)}
                  >
                    {m.bank_review_row_rule_attribution({ text: ruleAttributionText(r) })}
                  </button>
                {/if}
              {/if}
            </div>
            <div class="flex items-center justify-end gap-2">
              {#if row.decision === "pending"}
                <span class="text-xs text-amber-300">{m.bank_review_decision_pending_cue()}</span>
              {/if}
              {@render decisionControl(row)}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Sticky bottom commit bar — always reachable on mobile + long lists. -->
  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-slate-950/90 px-4 py-3 pb-[var(--mobile-action-bottom)] backdrop-blur md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
  >
    <Button variant="ghost" onclick={() => void onCancel()}>
      {m.bank_review_cancel()}
    </Button>
    <Button
      variant="primary"
      disabled={!canCommit || commitMut.isPending}
      onclick={() => (confirmOpen = true)}
    >
      {m.bank_review_commit()}
    </Button>
  </div>
</div>

<!-- Final confirmation: read-only digest of exactly what will be created,
     shown before the irreversible commit. -->
<Dialog open={confirmOpen} onclose={() => (confirmOpen = false)} title={m.bank_confirm_title()}>
  <div class="space-y-4">
    {#if accountQuery.data}
      <p class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
        {m.bank_review_account_destination({
          bank: bankKindLabel(accountQuery.data.kind),
          account: accountQuery.data.label,
        })}
      </p>
    {/if}
    <p class="text-sm text-slate-300">
      {m.bank_confirm_summary({ add: importRows.length, skip: skipCount })}
    </p>

    {#if dupAmongImport > 0}
      <p
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
      >
        {m.bank_confirm_dup_warning({ count: dupAmongImport })}
      </p>
    {/if}

    {#if uncategorizedImportRows.length > 0}
      <p class="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
        {m.bank_confirm_inne_banner({ count: uncategorizedImportRows.length })}
      </p>
    {/if}

    <ul class="max-h-72 space-y-1.5 overflow-y-auto">
      {#each importRows as row (row.id)}
        {@const cat = categoryName(row.selected_category_id)}
        <li class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
          <div class="flex items-start justify-between gap-3">
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
              {row.counterparty ?? row.edited_description ?? row.description}
            </span>
            <span
              class={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                row.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-slate-500">
            {cat ?? m.bank_confirm_fallback_category()} · {row.posted_at}
          </p>
        </li>
      {/each}
    </ul>

    {#if skipCount > 0}
      <details class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
        <summary class="cursor-pointer text-xs text-slate-400">
          {m.bank_confirm_skipped_heading({ count: skipCount })}
        </summary>
        <ul class="mt-2 space-y-1">
          {#each skippedRows as row (row.id)}
            <li class="flex justify-between gap-3 text-xs text-slate-500">
              <span class="min-w-0 truncate">
                {row.counterparty ?? row.edited_description ?? row.description}
              </span>
              <span class="shrink-0 tabular-nums">
                {formatCurrency(row.amount, row.currency)}
              </span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    <div class="flex justify-end gap-2">
      <Button variant="ghost" onclick={() => (confirmOpen = false)} disabled={commitMut.isPending}>
        {m.bank_confirm_back()}
      </Button>
      <Button
        variant="primary"
        disabled={commitMut.isPending}
        loading={commitMut.isPending}
        onclick={() => commitMut.mutate()}
      >
        {commitMut.isPending
          ? m.bank_commit_running()
          : m.bank_confirm_submit({ count: importRows.length })}
      </Button>
    </div>
  </div>
</Dialog>
