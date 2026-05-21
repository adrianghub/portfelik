<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
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
  let selectedRowIds = $state<Set<string>>(new Set());
  let bulkCategoryId = $state<string>("");
  let focusedRowId = $state<string | null>(null);

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

  const selectedCount = $derived(selectedRowIds.size);

  const allVisibleSelected = $derived(
    visibleRows.length > 0 && visibleRows.every((r) => selectedRowIds.has(r.id))
  );

  function categoriesFor(type: "income" | "expense") {
    return (categoriesQuery.data ?? []).filter((c) => c.type === type);
  }

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

  async function bulkImportValid(): Promise<void> {
    const targets = rows.filter((r) => r.selected_category_id !== null && r.decision !== "import");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "import" })));
  }

  async function bulkSkipAll(): Promise<void> {
    const targets = rows.filter((r) => r.decision !== "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  async function bulkSkipProbableDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => warningsByRow.has(r.id) && r.decision !== "duplicate");
    await Promise.all(
      flagged.map((r) =>
        patchRow(r.id, {
          decision: "duplicate",
          duplicate_of: warningsByRow.get(r.id) ?? null,
        })
      )
    );
  }

  async function bulkSetCategory(categoryId: string): Promise<void> {
    if (!categoryId || selectedRowIds.size === 0) return;
    const cat = (categoriesQuery.data ?? []).find((c) => c.id === categoryId);
    if (!cat) return;
    const selectedRows = rows.filter((r) => selectedRowIds.has(r.id));
    const targets = selectedRows.filter((r) => r.type === cat.type);
    const skipped = selectedRows.length - targets.length;
    await Promise.all(targets.map((r) => patchRow(r.id, { selected_category_id: categoryId })));
    selectedRowIds = new Set();
    bulkCategoryId = "";
    if (skipped > 0) {
      toast.message(m.bank_review_bulk_set_category_skipped({ count: skipped }));
    }
  }

  function toggleRow(id: string): void {
    const next = new Set(selectedRowIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedRowIds = next;
  }

  function toggleAllVisible(): void {
    const next = new Set(selectedRowIds);
    if (allVisibleSelected) {
      for (const r of visibleRows) next.delete(r.id);
    } else {
      for (const r of visibleRows) next.add(r.id);
    }
    selectedRowIds = next;
  }

  function clearFilter(): void {
    filter = "all";
  }

  function getImportedDateRange(): ImportedDateRange | undefined {
    const dates = rows
      .filter((r) => r.decision === "import" || r.decision === "duplicate")
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

  // Categories shown in the bulk dropdown: filter by the dominant type
  // across the current selection so the picker is never overwhelming.
  const bulkCategoryOptions = $derived.by(() => {
    if (selectedCount === 0) return [];
    const selectedRows = rows.filter((r) => selectedRowIds.has(r.id));
    const incomeRows = selectedRows.filter((r) => r.type === "income").length;
    const expenseRows = selectedRows.filter((r) => r.type === "expense").length;
    // Tie → expense (safer default).
    const dominant: "income" | "expense" = incomeRows > expenseRows ? "income" : "expense";
    return categoriesFor(dominant);
  });

  const filterOptions: { kind: FilterKind; label: string }[] = $derived([
    { kind: "all", label: m.bank_review_filter_all() },
    { kind: "pending", label: m.bank_review_filter_pending() },
    { kind: "uncategorized", label: m.bank_review_filter_uncategorized() },
    { kind: "income", label: m.bank_review_filter_income() },
    { kind: "expense", label: m.bank_review_filter_expense() },
  ]);
</script>

<div class="space-y-4 pb-24">
  <!-- Sticky top bar: warnings + bulk actions. Stays in view while
       scrolling through a long preview list. -->
  <div class="sticky top-0 z-20 -mx-4 space-y-2 bg-slate-950/85 px-4 py-2 backdrop-blur">
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
      <Button variant="ghost" size="sm" onclick={bulkImportValid}>
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

      {#if selectedCount > 0}
        <span class="ml-2 text-xs text-slate-400">
          {m.bank_review_selected_count({ count: selectedCount })}
        </span>
        <Select
          value={bulkCategoryId}
          onchange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            bulkCategoryId = v;
            if (v) void bulkSetCategory(v);
          }}
          class="w-auto"
        >
          <option value="">{m.bank_review_bulk_set_category()}</option>
          {#each bulkCategoryOptions as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </Select>
      {/if}
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
    <!-- Desktop: table inside its own scroll container so the <thead>
         can stay sticky to the table region without fighting the
         page-level sticky warnings+bulk bar above. -->
    <div
      class="hidden max-h-[calc(100vh-22rem)] overflow-y-auto rounded-2xl border border-white/10 focus:outline-none md:block"
    >
      <table class="min-w-full divide-y divide-white/5 text-sm">
        <thead class="sticky top-0 z-10 bg-slate-900/95 text-xs text-slate-400 uppercase">
          <tr>
            <th class="px-3 py-2 text-left">
              <input
                type="checkbox"
                aria-label={m.bank_review_select_all_visible()}
                checked={allVisibleSelected}
                onchange={toggleAllVisible}
                class="h-4 w-4 rounded border-white/20 bg-slate-900/60"
              />
            </th>
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
              class={cn(
                "focus:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
                selectedRowIds.has(row.id) && "bg-emerald-500/5"
              )}
            >
              <td class="px-3 py-2 align-top">
                <input
                  type="checkbox"
                  aria-label={m.bank_review_select_row()}
                  checked={selectedRowIds.has(row.id)}
                  onchange={() => toggleRow(row.id)}
                  class="h-4 w-4 rounded border-white/20 bg-slate-900/60"
                />
              </td>
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
                  <option value="duplicate">{m.bank_review_decision_duplicate()}</option>
                </Select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile: card list. Each card carries the same controls as the desktop
         row except the group select (most users never change it on phones; if
         a group is already set we surface it as a small badge). -->
    <ul class="space-y-2 md:hidden">
      {#each visibleRows as row (row.id)}
        {@const groupName = (groupsQuery.data ?? []).find(
          (g) => g.id === row.selected_group_id
        )?.name}
        <li
          class={cn(
            "space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-3",
            selectedRowIds.has(row.id) && "border-emerald-400/40 bg-emerald-500/5"
          )}
        >
          <header class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-xs text-slate-500">{row.posted_at}</p>
              <p class="truncate text-sm font-medium text-slate-100">
                {row.counterparty ?? row.edited_description ?? row.description}
              </p>
              {#if row.counterparty}
                <p class="truncate text-xs text-slate-400">
                  {row.edited_description ?? row.description}
                </p>
              {/if}
              {#if groupName}
                <div class="mt-1">
                  <Badge variant="shared">{groupName}</Badge>
                </div>
              {/if}
            </div>
            <div class="space-y-1 text-right">
              <p
                class="tabular-nums"
                class:text-rose-300={row.type === "expense"}
                class:text-emerald-300={row.type === "income"}
              >
                {row.type === "expense" ? "-" : "+"}{formatCurrency(row.amount, row.currency)}
              </p>
              {#if warningsByRow.has(row.id)}
                <Badge variant="overdue">{m.bank_review_probable_duplicate()}</Badge>
              {/if}
            </div>
          </header>

          <div class="grid grid-cols-2 gap-2">
            <Select
              class="w-full"
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
            <Select
              class="w-full"
              value={row.decision}
              onchange={(e) => {
                const v = (e.target as HTMLSelectElement).value as RowDecision;
                void patchRow(row.id, { decision: v });
              }}
            >
              <option value="pending">{m.bank_review_decision_pending()}</option>
              <option value="import">{m.bank_review_decision_import()}</option>
              <option value="skip">{m.bank_review_decision_skip()}</option>
              <option value="duplicate">{m.bank_review_decision_duplicate()}</option>
            </Select>
          </div>

          <label class="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={selectedRowIds.has(row.id)}
              onchange={() => toggleRow(row.id)}
              class="h-4 w-4 rounded border-white/20 bg-slate-900/60"
            />
            {m.bank_review_select_row()}
          </label>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Sticky bottom commit bar — always reachable on mobile + long lists. -->
  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur"
  >
    <Button variant="ghost" onclick={() => void onCancel()}>
      {m.bank_review_cancel()}
    </Button>
    <Button
      variant="primary"
      disabled={!canCommit || commitMut.isPending}
      loading={commitMut.isPending}
      onclick={() => commitMut.mutate()}
    >
      {commitMut.isPending ? m.bank_commit_running() : m.bank_review_commit()}
    </Button>
  </div>
</div>
