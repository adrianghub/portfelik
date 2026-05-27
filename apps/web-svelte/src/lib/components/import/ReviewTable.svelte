<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import { createCategorizationRule } from "$lib/services/categorization-rules";
  import { matchCategory } from "$lib/import/categorize";
  import type { CategorizationRule } from "$lib/types";
  import {
    commitImportSession,
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
    onCommitted: (result: CommitResult, dateRange?: ImportedDateRange) => void;
    onCancel: () => Promise<void> | void;
  }
  let { session, onCommitted, onCancel }: Props = $props();

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

  const warningsQuery = createQuery(() => ({
    queryKey: ["import_preview_warnings", session.id],
    queryFn: () => previewFingerprintWarnings(session.id),
  }));

  const warningsByRow = $derived(
    new Map((warningsQuery.data ?? []).map((w) => [w.row_id, w.duplicate_of_transaction_id]))
  );

  const rows = $derived<ImportRow[]>(rowsQuery.data ?? []);
  const pendingCount = $derived(rows.filter((r) => r.decision === "pending").length);
  const canCommit = $derived(rows.length > 0 && pendingCount === 0);

  type FilterKind = "all" | "pending" | "uncategorized" | "income" | "expense";
  let filter = $state<FilterKind>("all");
  let focusedRowId = $state<string | null>(null);
  let confirmOpen = $state(false);

  const filterCounts = $derived({
    all: rows.length,
    pending: rows.filter((r) => r.decision === "pending").length,
    uncategorized: rows.filter((r) => r.selected_category_id == null).length,
    income: rows.filter((r) => r.type === "income").length,
    expense: rows.filter((r) => r.type === "expense").length,
  });

  const visibleRows = $derived.by(() => {
    switch (filter) {
      case "pending":
        return rows.filter((r) => r.decision === "pending");
      case "uncategorized":
        return rows.filter((r) => r.selected_category_id == null);
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

  function categoryName(id: string | null): string | null {
    if (!id) return null;
    return (categoriesQuery.data ?? []).find((c) => c.id === id)?.name ?? null;
  }

  // Final-confirmation digest: only the rows that will actually become
  // transactions, plus a flag for any probable duplicates still set to import.
  const importRows = $derived(rows.filter((r) => r.decision === "import"));
  const skipCount = $derived(rows.filter((r) => r.decision === "skip").length);
  const dupAmongImport = $derived(importRows.filter((r) => warningsByRow.has(r.id)).length);

  /**
   * Optimistic patch + automatic decision flip on category set/clear:
   *   * setting a category on a 'pending' row → decision='import'
   *   * clearing the category on an 'import' row → decision='pending'
   * Lets users sweep through with category picks alone; no need to also
   * touch the decision column.
   */
  async function patchRow(rowId: string, patch: Partial<ImportRow>): Promise<void> {
    const previous = queryClient.getQueryData<ImportRow[]>(rowsKey);
    const current = previous?.find((r) => r.id === rowId);

    let effective: Partial<ImportRow> = patch;
    if (current && "selected_category_id" in patch) {
      const becameSet = patch.selected_category_id != null && current.selected_category_id == null;
      const becameCleared =
        patch.selected_category_id == null && current.selected_category_id != null;
      if (becameSet && current.decision === "pending") {
        effective = { ...effective, decision: "import" };
      } else if (becameCleared && current.decision === "import") {
        effective = { ...effective, decision: "pending" };
      }
    }

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

  // Eligible = has a category but is not yet marked import. When zero, the
  // "import all with category" button is disabled (it would otherwise no-op
  // silently in the default, uncategorized state).
  const bulkImportableCount = $derived(
    rows.filter((r) => r.selected_category_id !== null && r.decision !== "import").length
  );

  async function bulkImportValid(): Promise<void> {
    const targets = rows.filter((r) => r.selected_category_id !== null && r.decision !== "import");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "import" })));
  }

  async function bulkSkipAll(): Promise<void> {
    const targets = rows.filter((r) => r.decision !== "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  // Probable-duplicate rows are flagged by the fingerprint preview. The user
  // sweeps them to 'skip' in one tap; true hard duplicates (external-id /
  // file-hash matches) are caught again at commit time by the RPC regardless.
  async function bulkSkipProbableDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => warningsByRow.has(r.id) && r.decision !== "skip");
    await Promise.all(flagged.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  function clearFilter(): void {
    filter = "all";
  }

  // "Save as rule": turn a categorized row into a reusable categorization rule
  // so future imports pre-fill the same category. Match phrase defaults to the
  // counterparty when present (more stable than the free-text description).
  let ruleRow = $state<ImportRow | null>(null);
  let ruleField = $state<"description" | "counterparty">("description");
  let ruleKind = $state<"contains" | "exact">("contains");
  let ruleText = $state("");
  let ruleSaving = $state(false);

  // Candidate rule from the live dialog state — drives the match-count preview
  // and the "apply to current batch" step on save.
  function draftRule(): CategorizationRule | null {
    const catId = ruleRow?.selected_category_id;
    const text = ruleText.trim();
    if (!catId || text === "") return null;
    return {
      id: "__draft__",
      user_id: "__draft__",
      kind: ruleKind,
      match_description: ruleField === "description" ? text : null,
      match_counterparty: ruleField === "counterparty" ? text : null,
      match_type: null,
      category_id: catId,
      priority: 0,
      created_at: "",
    };
  }

  const ruleMatchCount = $derived.by(() => {
    const draft = draftRule();
    if (!draft) return 0;
    const cats = categoriesQuery.data ?? [];
    return rows.filter((r) => matchCategory(r, [draft], cats) !== null).length;
  });

  function openRuleDialog(row: ImportRow): void {
    if (!row.selected_category_id) return;
    ruleRow = row;
    ruleField = row.counterparty ? "counterparty" : "description";
    ruleKind = "contains";
    ruleText = row.counterparty ?? row.edited_description ?? row.description;
  }

  async function saveRule(): Promise<void> {
    const row = ruleRow;
    const text = ruleText.trim();
    if (!row || !row.selected_category_id || text === "") return;
    ruleSaving = true;
    try {
      const created = await createCategorizationRule({
        kind: ruleKind,
        category_id: row.selected_category_id,
        match_description: ruleField === "description" ? text : null,
        match_counterparty: ruleField === "counterparty" ? text : null,
      });
      await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });

      // Apply to the current batch: fill matching rows that are still
      // uncategorized (never overwrite a manual category pick). patchRow flips
      // pending → import when a category lands.
      const cats = categoriesQuery.data ?? [];
      const targets = rows.filter(
        (r) => r.selected_category_id == null && matchCategory(r, [created], cats) !== null
      );
      await Promise.all(
        targets.map((r) => patchRow(r.id, { selected_category_id: created.category_id }))
      );

      toast.success(
        m.bank_review_save_rule_success(),
        targets.length > 0
          ? { description: m.bank_review_rule_applied({ count: targets.length }) }
          : undefined
      );
      ruleRow = null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
    { kind: "all", label: m.bank_review_filter_all() },
    { kind: "pending", label: m.bank_review_filter_pending() },
    { kind: "uncategorized", label: m.bank_review_filter_uncategorized() },
    { kind: "income", label: m.bank_review_filter_income() },
    { kind: "expense", label: m.bank_review_filter_expense() },
  ]);
</script>

<div class="space-y-4 pb-24">
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
        {m.bank_review_pending_warning({ count: pendingCount })}
      </p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={bulkImportableCount === 0}
        onclick={bulkImportValid}
      >
        {m.bank_review_bulk_import_valid()}
      </Button>
      <Button variant="ghost" size="sm" onclick={bulkSkipAll}>
        {m.bank_review_bulk_skip_all()}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={warningsByRow.size === 0}
        onclick={bulkSkipProbableDuplicates}
      >
        {m.bank_review_bulk_skip_duplicates()}
      </Button>
    </div>
  </div>

  <!-- Filter chips (non-sticky; scroll with page). -->
  <div class="flex flex-wrap items-center gap-2">
    {#each filterOptions as f (f.kind)}
      <button
        type="button"
        class={cn(
          "rounded-full border px-3 py-1 text-xs transition-colors",
          filter === f.kind
            ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
            : "border-white/10 text-slate-400 hover:bg-white/5"
        )}
        onclick={() => (filter = f.kind)}
      >
        {f.label}<span class="ml-1.5 text-slate-500">{filterCounts[f.kind]}</span>
      </button>
    {/each}
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
    <!-- Desktop: no inner scroll — the page is the single scroll surface and
         the <thead> stays pinned just below the fixed app nav (top-14). -->
    <div class="hidden rounded-2xl border border-white/10 md:block">
      <table class="min-w-full divide-y divide-white/5 text-sm">
        <thead class="sticky top-16 z-10 bg-slate-900 text-xs text-slate-400 uppercase">
          <tr>
            <th class="px-3 py-2 text-left">{m.bank_review_header_date()}</th>
            <th class="px-3 py-2 text-right">{m.bank_review_header_amount()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_description()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_category()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_group()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_decision()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 bg-slate-950/40">
          {#each visibleRows as row, idx (row.id)}
            <tr
              bind:this={rowRefs[row.id]}
              tabindex={focusedRowId === row.id || (focusedRowId === null && idx === 0) ? 0 : -1}
              onfocus={() => (focusedRowId = row.id)}
              onkeydown={handleTableKeydown}
              class="focus:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
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
                  <div class="mb-1">
                    <Badge variant="overdue">{m.bank_review_probable_duplicate()}</Badge>
                  </div>
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
                  <Select
                    value={row.selected_category_id ?? ""}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      void patchRow(row.id, { selected_category_id: v === "" ? null : v });
                    }}
                  >
                    <option value="">—</option>
                    {#each categoriesFor(row.type) as c (c.id)}
                      <option value={c.id}>{c.name}</option>
                    {/each}
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={m.bank_review_save_rule()}
                    disabled={!row.selected_category_id}
                    onclick={() => openRuleDialog(row)}
                  >
                    <BookmarkPlus size={16} aria-hidden="true" />
                  </Button>
                </div>
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
                <Select
                  value={row.decision}
                  onchange={(e) => {
                    const v = (e.target as HTMLSelectElement).value as RowDecision;
                    void patchRow(row.id, { decision: v });
                  }}
                >
                  <option value="pending">{m.bank_review_decision_pending()}</option>
                  <option value="import">{m.bank_review_decision_import()}</option>
                  <option value="skip">{m.bank_review_decision_skip()}</option>
                </Select>
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
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex min-w-0 items-center gap-1">
              <Select
                class="w-full min-w-0"
                value={row.selected_category_id ?? ""}
                onchange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  void patchRow(row.id, { selected_category_id: v === "" ? null : v });
                }}
              >
                <option value="">{m.bank_review_header_category()}</option>
                {#each categoriesFor(row.type) as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                title={m.bank_review_save_rule()}
                disabled={!row.selected_category_id}
                onclick={() => openRuleDialog(row)}
              >
                <BookmarkPlus size={16} aria-hidden="true" />
              </Button>
            </div>
            <Select
              class="w-full min-w-0"
              value={row.decision}
              onchange={(e) => {
                const v = (e.target as HTMLSelectElement).value as RowDecision;
                void patchRow(row.id, { decision: v });
              }}
            >
              <option value="pending">{m.bank_review_decision_pending()}</option>
              <option value="import">{m.bank_review_decision_import()}</option>
              <option value="skip">{m.bank_review_decision_skip()}</option>
            </Select>
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

<!-- Save-as-rule: create a reusable categorization rule from a categorized row. -->
<Dialog
  open={ruleRow !== null}
  onclose={() => (ruleRow = null)}
  title={m.bank_review_save_rule_title()}
>
  {#if ruleRow}
    <div class="space-y-4">
      <label class="block space-y-1">
        <span class="text-xs text-slate-400">{m.bank_review_save_rule_match_label()}</span>
        <Select
          value={ruleField}
          onchange={(e) =>
            (ruleField = (e.target as HTMLSelectElement).value as "description" | "counterparty")}
        >
          <option value="counterparty">{m.bank_review_save_rule_field_counterparty()}</option>
          <option value="description">{m.bank_review_save_rule_field_description()}</option>
        </Select>
      </label>
      <label class="block space-y-1">
        <span class="text-xs text-slate-400">{m.bank_review_save_rule_kind_label()}</span>
        <Select
          value={ruleKind}
          onchange={(e) =>
            (ruleKind = (e.target as HTMLSelectElement).value as "contains" | "exact")}
        >
          <option value="contains">{m.bank_review_save_rule_kind_contains()}</option>
          <option value="exact">{m.bank_review_save_rule_kind_exact()}</option>
        </Select>
      </label>
      <label class="block space-y-1">
        <span class="text-xs text-slate-400">{m.bank_review_save_rule_text_label()}</span>
        <Input bind:value={ruleText} />
      </label>
      <p class="text-xs text-slate-500">
        {m.bank_review_save_rule_preview({ count: ruleMatchCount, total: rows.length })}
      </p>
      <p class="text-xs text-slate-400">
        {m.bank_review_save_rule_category_label()}: {categoryName(ruleRow.selected_category_id) ??
          "—"}
      </p>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" onclick={() => (ruleRow = null)} disabled={ruleSaving}>
          {m.bank_review_save_rule_cancel()}
        </Button>
        <Button
          variant="primary"
          disabled={ruleSaving || ruleText.trim() === ""}
          loading={ruleSaving}
          onclick={() => void saveRule()}
        >
          {m.bank_review_save_rule_submit()}
        </Button>
      </div>
    </div>
  {/if}
</Dialog>

<!-- Final confirmation: read-only digest of exactly what will be created,
     shown before the irreversible commit. -->
<Dialog open={confirmOpen} onclose={() => (confirmOpen = false)} title={m.bank_confirm_title()}>
  <div class="space-y-4">
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
            {cat ?? m.bank_confirm_no_category()} · {row.posted_at}
          </p>
        </li>
      {/each}
    </ul>

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
