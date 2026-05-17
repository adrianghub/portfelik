<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import CategoryBreakdown from "$lib/components/transactions/CategoryBreakdown.svelte";
  import FilterDrawer from "$lib/components/transactions/FilterDrawer.svelte";
  import SummaryCards from "$lib/components/transactions/SummaryCards.svelte";
  import TransactionDetailSheet from "$lib/components/transactions/TransactionDetailSheet.svelte";
  import TransactionDialog from "$lib/components/transactions/TransactionDialog.svelte";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    bulkCreateTransactions,
    computeSummary,
    deleteTransaction,
    deleteTransactions,
    fetchTransactions,
  } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import type { TransactionStatus, TransactionType, TransactionWithCategory } from "$lib/types";
  import { cn, getDateRangeBounds, monthYearLabel } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { Download, Plus, SlidersHorizontal, Trash2, Upload } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const now = new Date();

  const startYear = $derived(Number($page.url.searchParams.get("startYear")) || now.getFullYear());
  const startMonth = $derived(
    Number($page.url.searchParams.get("startMonth")) || now.getMonth() + 1
  );
  const endYear = $derived(Number($page.url.searchParams.get("endYear")) || startYear);
  const endMonth = $derived(Number($page.url.searchParams.get("endMonth")) || startMonth);
  const categoryId = $derived($page.url.searchParams.get("categoryId") ?? undefined);
  const statusFilter = $derived($page.url.searchParams.get("status") ?? undefined);
  const typeFilter = $derived(
    ($page.url.searchParams.get("type") as "income" | "expense" | null) ?? undefined
  );

  const bounds = $derived(getDateRangeBounds(startYear, startMonth, endYear, endMonth));

  const emptyLabel = $derived(
    startYear === endYear && startMonth === endMonth
      ? m.transactions_empty_month({ period: monthYearLabel(startYear, startMonth) })
      : m.transactions_empty_range({
          from: monthYearLabel(startYear, startMonth),
          to: monthYearLabel(endYear, endMonth),
        })
  );

  const txQuery = createQuery(() => ({
    queryKey: ["transactions", startYear, startMonth, endYear, endMonth, categoryId],
    queryFn: () => fetchTransactions(bounds.start, bounds.end, categoryId),
  }));

  const statusSet = $derived(statusFilter ? new Set(statusFilter.split(",")) : null);

  let groupFilter = $state<"all" | "own" | string>("all");

  // filteredTxs: applies BOTH status filter AND group filter so it's the
  // canonical "what the user is looking at" set used by summary,
  // CategoryBreakdown, CSV export, etc.
  const filteredTxs = $derived.by(() => {
    if (!txQuery.data) return undefined;
    return txQuery.data.filter((tx) => {
      const matchStatus = !statusSet || statusSet.has(tx.status);
      const matchType = !typeFilter || tx.type === typeFilter;
      const matchGroup =
        groupFilter === "all" ||
        (groupFilter === "own" ? tx.group_id === null : tx.group_id === groupFilter);
      return matchStatus && matchType && matchGroup;
    });
  });

  // visibleTxs adds the search filter on top — search is row-only UI sugar
  // so it deliberately doesn't affect totals.
  let searchQuery = $state("");
  const visibleTxs = $derived(
    filteredTxs?.filter(
      (tx) => !searchQuery || tx.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const summary = $derived(filteredTxs ? computeSummary(filteredTxs) : null);

  let currentUserId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    currentUserId = data.session?.user.id ?? null;
  });

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
    enabled: !!currentUserId,
  }));

  // Dialog state
  let dialogOpen = $state(false);
  let editTarget = $state<TransactionWithCategory | null>(null);
  let deleteTargetId = $state<string | null>(null);
  let sheetTx = $state<TransactionWithCategory | null>(null);
  let selectedIds = $state(new Set<string>());
  let bulkDeleteConfirm = $state(false);

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteTransaction(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transaction_deleted());
      deleteTargetId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const bulkDeleteMutation = createMutation(() => ({
    mutationFn: () => deleteTransactions(Array.from(selectedIds)),
    onSuccess: async () => {
      const count = selectedIds.size;
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transactions_bulk_deleted({ count }));
      selectedIds = new Set<string>();
      bulkDeleteConfirm = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  let filterDrawerOpen = $state(false);
  const activeFilterCount = $derived(
    (statusFilter ? 1 : 0) + (categoryId ? 1 : 0) + (typeFilter ? 1 : 0)
  );

  function onApplyFilters(params: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
    categoryId: string | undefined;
    status: string | undefined;
    type: "income" | "expense" | undefined;
  }) {
    const p = new URLSearchParams($page.url.searchParams);
    p.set("startYear", String(params.startYear));
    p.set("startMonth", String(params.startMonth));
    p.set("endYear", String(params.endYear));
    p.set("endMonth", String(params.endMonth));
    if (params.categoryId) p.set("categoryId", params.categoryId);
    else p.delete("categoryId");
    if (params.status) p.set("status", params.status);
    else p.delete("status");
    if (params.type) p.set("type", params.type);
    else p.delete("type");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function openAdd() {
    editTarget = null;
    dialogOpen = true;
  }

  function onCategoryChange(id: string | undefined) {
    const params = new URLSearchParams($page.url.searchParams);
    if (id) params.set("categoryId", id);
    else params.delete("categoryId");
    goto(`/transactions?${params.toString()}`, { replaceState: false });
  }

  // CSV helpers
  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }

  function parseCSVRow(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (line[i] === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += line[i];
      }
    }
    result.push(current);
    return result;
  }

  function handleExport() {
    if (!filteredTxs?.length) return;
    const headers = [
      "date",
      "description",
      "amount",
      "type",
      "status",
      "category",
      "is_recurring",
      "recurring_day",
    ];
    const rows = filteredTxs.map((tx) =>
      [
        tx.date,
        tx.description,
        tx.amount.toString(),
        tx.type,
        tx.status,
        tx.category_name,
        tx.is_recurring ? "true" : "false",
        tx.recurring_day?.toString() ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfelik-transakcje-${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let fileInput = $state<HTMLInputElement | null>(null);
  let importing = $state(false);

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !categoriesQuery.data) return;
    (e.target as HTMLInputElement).value = "";

    importing = true;
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) return;

      const headers = parseCSVRow(lines[0]).map((h) => h.trim().replace(/^\uFEFF/, ""));
      const catMap = new Map(
        categoriesQuery.data.map((c) => [`${c.name.toLowerCase()}|${c.type}`, c])
      );
      const unknownCategories = new Set<string>();
      const validRows: Parameters<typeof bulkCreateTransactions>[0] = [];

      for (const line of lines.slice(1)) {
        const values = parseCSVRow(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = values[i]?.trim() ?? "";
        });

        const cat = catMap.get(`${row["category"]?.toLowerCase() ?? ""}|${row["type"]}`);
        if (!cat) {
          if (row["category"]) unknownCategories.add(row["category"]);
          continue;
        }

        const amount = parseFloat(row["amount"]);
        if (!row["date"] || !row["description"] || isNaN(amount) || !row["type"]) continue;
        if (row["type"] !== "income" && row["type"] !== "expense") continue;

        const validStatuses: TransactionStatus[] = ["paid", "draft", "upcoming", "overdue"];
        const status: TransactionStatus = validStatuses.includes(row["status"] as TransactionStatus)
          ? (row["status"] as TransactionStatus)
          : "paid";

        validRows.push({
          date: row["date"],
          description: row["description"],
          amount,
          type: row["type"] as TransactionType,
          status,
          category_id: cat.id,
          is_recurring: row["is_recurring"] === "true",
          recurring_day: row["recurring_day"] ? parseInt(row["recurring_day"]) : null,
        });
      }

      const imported = validRows.length > 0 ? await bulkCreateTransactions(validRows) : 0;

      await queryClient.invalidateQueries({ queryKey: ["transactions"] });

      if (unknownCategories.size > 0) {
        toast.success(
          `Zaimportowano ${imported} transakcji. Nieznane kategorie: ${Array.from(unknownCategories).join(", ")}`
        );
      } else {
        toast.success(`Zaimportowano ${imported} transakcji`);
      }
    } catch {
      toast.error(m.csv_import_error());
    } finally {
      importing = false;
    }
  }
</script>

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-hero font-semibold text-slate-100">{m.transactions_title()}</h1>
      {#if groupsQuery.data}
        <p class="mt-0.5 hidden text-xs text-slate-400 md:block">
          {groupsQuery.data.length > 0
            ? m.transactions_subtitle_groups()
            : m.transactions_subtitle_own()}
        </p>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <!-- Filter button — opens drawer on every viewport (Phase U4 start) -->
      <button
        type="button"
        onclick={() => (filterDrawerOpen = true)}
        class="relative flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 py-1.5 text-sm font-medium text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
      >
        <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" />
        {m.transactions_filter_button()}
        {#if activeFilterCount > 0}
          <span
            class="bg-accent-gradient absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-slate-900"
          >
            {activeFilterCount}
          </span>
        {/if}
      </button>
      <button
        onclick={handleExport}
        disabled={!filteredTxs?.length}
        class="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 py-1.5 text-sm font-medium text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        title={m.csv_export()}
      >
        <Download size={14} strokeWidth={1.8} aria-hidden="true" />
        <span class="hidden sm:inline">{m.csv_export()}</span>
      </button>
      <label
        class="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 py-1.5 text-sm font-medium text-slate-300 backdrop-blur transition-colors focus-within:ring-2 focus-within:ring-emerald-400 hover:bg-white/5"
        title={m.csv_import()}
      >
        <Upload size={14} strokeWidth={1.8} aria-hidden="true" />
        <span class="hidden sm:inline">{importing ? m.csv_importing() : m.csv_import()}</span>
        <input
          bind:this={fileInput}
          type="file"
          accept=".csv"
          class="sr-only"
          onchange={handleImport}
          disabled={importing}
        />
      </label>
      {#if selectedIds.size > 0}
        <button
          onclick={() => (bulkDeleteConfirm = true)}
          class="flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-300 backdrop-blur transition-colors hover:bg-rose-500/20"
        >
          <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
          {m.transactions_delete_selected({ count: selectedIds.size })}
        </button>
      {/if}
      <button
        onclick={openAdd}
        class="bg-accent-gradient hidden items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none md:inline-flex"
      >
        + {m.transaction_add()}
      </button>
    </div>
  </div>

  {#if groupsQuery.data && groupsQuery.data.length > 0}
    <div role="tablist" aria-label="Grupa" class="flex flex-wrap gap-1">
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === "all"}
        onclick={() => (groupFilter = "all")}
        class={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
          groupFilter === "all"
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {m.group_filter_all()}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === "own"}
        onclick={() => (groupFilter = "own")}
        class={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
          groupFilter === "own"
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {m.group_filter_own()}
      </button>
      {#each groupsQuery.data as g (g.id)}
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === g.id}
          onclick={() => (groupFilter = g.id)}
          class={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
            groupFilter === g.id
              ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
              : "border border-white/5 text-slate-300 hover:bg-white/5"
          )}
        >
          {g.name}
        </button>
      {/each}
    </div>
  {/if}

  {#if summary}
    <SummaryCards {summary} />
  {:else if txQuery.isLoading}
    <div class="grid grid-cols-3 gap-3">
      {#each [0, 1, 2] as _, i (i)}
        <div
          class="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        ></div>
      {/each}
    </div>
  {/if}

  {#if summary && summary.total_expenses > 0}
    <CategoryBreakdown categories={summary.categories} oncategoryclick={onCategoryChange} />
  {/if}

  {#if txQuery.isLoading}
    <div class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  {:else if txQuery.isError}
    <p class="text-sm text-rose-300">{m.common_error_title()}</p>
  {:else if visibleTxs}
    <TransactionTable
      transactions={visibleTxs}
      {currentUserId}
      {emptyLabel}
      bind:selectedIds
      onrowclick={(tx) => (sheetTx = tx)}
      onedit={(tx: TransactionWithCategory) => {
        editTarget = tx;
        dialogOpen = true;
      }}
      ondelete={(id: string) => (deleteTargetId = id)}
    />
  {/if}

  {#if categoriesQuery.data}
    <FilterDrawer
      open={filterDrawerOpen}
      onclose={() => (filterDrawerOpen = false)}
      onapply={onApplyFilters}
      {startYear}
      {startMonth}
      {endYear}
      {endMonth}
      {categoryId}
      status={statusFilter}
      type={typeFilter}
      categories={categoriesQuery.data}
      {searchQuery}
      onsearchchange={(q) => (searchQuery = q)}
    />
  {/if}
</div>

<button
  onclick={openAdd}
  aria-label={m.transaction_add()}
  class="bg-accent-gradient fixed right-4 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full text-slate-900 shadow-[0_0_24px_var(--color-accent-glow)] transition-transform active:scale-95 md:hidden"
  style="margin-bottom: env(safe-area-inset-bottom);"
>
  <Plus size={24} strokeWidth={2.3} aria-hidden="true" />
</button>

<TransactionDialog open={dialogOpen} onclose={() => (dialogOpen = false)} initial={editTarget} />

<TransactionDetailSheet
  transaction={sheetTx}
  {currentUserId}
  onclose={() => (sheetTx = null)}
  onedit={(tx) => {
    sheetTx = null;
    editTarget = tx;
    dialogOpen = true;
  }}
  ondelete={(id) => {
    sheetTx = null;
    deleteTargetId = id;
  }}
/>

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.common_confirm_delete_description()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMutation.isPending}
/>

<ConfirmDialog
  open={bulkDeleteConfirm}
  message={m.transactions_delete_selected({ count: selectedIds.size })}
  onconfirm={() => bulkDeleteMutation.mutate()}
  onclose={() => (bulkDeleteConfirm = false)}
  pending={bulkDeleteMutation.isPending}
/>
