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
  import { computeSummary, deleteTransaction, fetchTransactions } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import type { TransactionWithCategory } from "$lib/types";
  import { getDateRangeBounds } from "$lib/utils";
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

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  let currentUserId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    currentUserId = data.session?.user.id ?? null;
  });

  // Dialog state
  let dialogOpen = $state(false);
  let editTarget = $state<TransactionWithCategory | null>(null);
  let deleteTargetId = $state<string | null>(null);
  let sheetTx = $state<TransactionWithCategory | null>(null);

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteTransaction(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transaction_deleted());
      deleteTargetId = null;
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
</script>

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-xl font-semibold text-zinc-900">
      {m.transactions_title()}
    </h1>
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
          class="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1 focus:outline-none"
        >
          <option value="">{m.transactions_filter_all_statuses()}</option>
          <option value="paid">{m.transactions_status_paid()}</option>
          <option value="upcoming">{m.transactions_status_upcoming()}</option>
          <option value="draft">{m.transactions_status_draft()}</option>
          <option value="overdue">{m.transactions_status_overdue()}</option>
        </select>
      </label>
      <button
        onclick={openAdd}
        class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
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
        <div class="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"></div>
      {/each}
    </div>
  {/if}

  {#if txQuery.isLoading}
    <div class="h-48 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"></div>
  {:else if txQuery.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if filteredTxs}
    <TransactionTable
      transactions={filteredTxs}
      {currentUserId}
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
