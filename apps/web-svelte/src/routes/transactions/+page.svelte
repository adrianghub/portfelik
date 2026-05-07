<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import CategoryBreakdown from "$lib/components/transactions/CategoryBreakdown.svelte";
  import CategoryFilter from "$lib/components/transactions/CategoryFilter.svelte";
  import MonthRangePicker from "$lib/components/transactions/MonthRangePicker.svelte";
  import SummaryCards from "$lib/components/transactions/SummaryCards.svelte";
  import TransactionDetailSheet from "$lib/components/transactions/TransactionDetailSheet.svelte";
  import TransactionDialog from "$lib/components/transactions/TransactionDialog.svelte";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import { fetchProfile } from "$lib/services/profiles";
  import {
    computeSummary,
    createTransaction,
    deleteTransaction,
    deleteTransactions,
    fetchTransactions,
  } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import type { TransactionStatus, TransactionType, TransactionWithCategory } from "$lib/types";
  import { getDateRangeBounds, monthYearLabel } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
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

  const filteredTxs = $derived(
    txQuery.data
      ? statusFilter
        ? txQuery.data.filter((tx) => tx.status === statusFilter)
        : txQuery.data
      : undefined
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

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", currentUserId],
    queryFn: () => fetchProfile(currentUserId!),
    enabled: !!currentUserId,
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

  function openAdd() {
    editTarget = null;
    dialogOpen = true;
  }

  function onRangeChange(sy: number, sm: number, ey: number, em: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("startYear", String(sy));
    params.set("startMonth", String(sm));
    params.set("endYear", String(ey));
    params.set("endMonth", String(em));
    goto(`/transactions?${params.toString()}`, { replaceState: false });
  }

  function onCategoryChange(id: string | undefined) {
    const params = new URLSearchParams($page.url.searchParams);
    if (id) params.set("categoryId", id);
    else params.delete("categoryId");
    goto(`/transactions?${params.toString()}`, { replaceState: false });
  }

  function onStatusChange(status: string | undefined) {
    const params = new URLSearchParams($page.url.searchParams);
    if (status) params.set("status", status);
    else params.delete("status");
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
      let imported = 0;

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

        await createTransaction({
          date: row["date"],
          description: row["description"],
          amount,
          type: row["type"] as TransactionType,
          status,
          category_id: cat.id,
          is_recurring: row["is_recurring"] === "true",
          recurring_day: row["recurring_day"] ? parseInt(row["recurring_day"]) : null,
        });
        imported++;
      }

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
      {#if profileQuery.data}
        <p class="mb-0.5 text-sm text-zinc-500">
          {m.transactions_greeting({ name: profileQuery.data.name ?? profileQuery.data.email })}
        </p>
      {/if}
      <h1 class="text-xl font-semibold text-zinc-900">{m.transactions_title()}</h1>
      {#if groupsQuery.data}
        <p class="mt-0.5 text-xs text-zinc-400">
          {groupsQuery.data.length > 0
            ? m.transactions_subtitle_groups()
            : m.transactions_subtitle_own()}
        </p>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <MonthRangePicker {startYear} {startMonth} {endYear} {endMonth} onchange={onRangeChange} />
      {#if categoriesQuery.data}
        <CategoryFilter
          categories={categoriesQuery.data}
          selectedId={categoryId}
          onchange={onCategoryChange}
        />
      {/if}
      <label class="flex items-center gap-2">
        <span class="sr-only">{m.transactions_filter_status_label()}</span>
        <select
          value={statusFilter ?? ""}
          onchange={(e) => onStatusChange((e.target as HTMLSelectElement).value || undefined)}
          class="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <option value="">{m.transactions_filter_all_statuses()}</option>
          <option value="paid">{m.transactions_status_paid()}</option>
          <option value="upcoming">{m.transactions_status_upcoming()}</option>
          <option value="draft">{m.transactions_status_draft()}</option>
          <option value="overdue">{m.transactions_status_overdue()}</option>
        </select>
      </label>
      <button
        onclick={handleExport}
        disabled={!filteredTxs?.length}
        class="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        title={m.csv_export()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
            points="7 10 12 15 17 10"
          /><line x1="12" x2="12" y1="15" y2="3" /></svg
        >
        <span class="hidden sm:inline">{m.csv_export()}</span>
      </button>
      <label
        class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        title={m.csv_import()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
            points="17 8 12 3 7 8"
          /><line x1="12" x2="12" y1="3" y2="15" /></svg
        >
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
          class="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          {m.transactions_delete_selected({ count: selectedIds.size })}
        </button>
      {/if}
      <button
        onclick={openAdd}
        class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        + {m.transaction_add()}
      </button>
    </div>
  </div>

  {#if summary}
    <SummaryCards {summary} />
  {:else if txQuery.isLoading}
    <div class="grid grid-cols-3 gap-3">
      {#each [0, 1, 2] as _, i (i)}
        <div class="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"></div>
      {/each}
    </div>
  {/if}

  {#if txQuery.isLoading}
    <div class="h-48 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"></div>
  {:else if txQuery.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if filteredTxs}
    <TransactionTable
      transactions={filteredTxs}
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

  {#if summary}
    <CategoryBreakdown categories={summary.categories} oncategoryclick={onCategoryChange} />
  {/if}
</div>

<button
  onclick={openAdd}
  aria-label={m.transaction_add()}
  class="fixed right-4 bottom-20 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-colors hover:bg-zinc-700 md:hidden dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
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
