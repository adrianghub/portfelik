<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import CategoryBreakdown from "$lib/components/transactions/CategoryBreakdown.svelte";
  import CategoryFilter from "$lib/components/transactions/CategoryFilter.svelte";
  import MonthPicker from "$lib/components/transactions/MonthPicker.svelte";
  import SummaryCards from "$lib/components/transactions/SummaryCards.svelte";
  import TransactionDialog from "$lib/components/transactions/TransactionDialog.svelte";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import {
    deleteTransaction,
    fetchMonthlySummary,
    fetchTransactions,
  } from "$lib/services/transactions";
  import type { TransactionWithCategory } from "$lib/types";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";

  const queryClient = useQueryClient();
  const now = new Date();

  const year = $derived(Number($page.url.searchParams.get("year")) || now.getFullYear());
  const month = $derived(Number($page.url.searchParams.get("month")) || now.getMonth() + 1);
  const categoryId = $derived($page.url.searchParams.get("categoryId") ?? undefined);

  const txQuery = createQuery(() => ({
    queryKey: ["transactions", year, month, categoryId],
    queryFn: () => fetchTransactions(year, month, categoryId),
  }));

  const summaryQuery = createQuery(() => ({
    queryKey: ["summary", year, month],
    queryFn: () => fetchMonthlySummary(year, month),
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  // Dialog state
  let dialogOpen = $state(false);
  let editTarget = $state<TransactionWithCategory | null>(null);
  let deleteTargetId = $state<string | null>(null);

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteTransaction(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      deleteTargetId = null;
    },
  }));

  function openAdd() {
    editTarget = null;
    dialogOpen = true;
  }

  function onMonthChange(newYear: number, newMonth: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    goto(`/transactions?${params.toString()}`, { replaceState: false });
  }

  function onCategoryChange(id: string | undefined) {
    const params = new URLSearchParams($page.url.searchParams);
    if (id) params.set("categoryId", id);
    else params.delete("categoryId");
    goto(`/transactions?${params.toString()}`, { replaceState: false });
  }
</script>

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-xl font-semibold text-zinc-900">
      {m.transactions_title()}
    </h1>
    <div class="flex flex-wrap items-center gap-3">
      <MonthPicker {year} {month} onchange={onMonthChange} />
      {#if categoriesQuery.data}
        <CategoryFilter
          categories={categoriesQuery.data}
          selectedId={categoryId}
          onchange={onCategoryChange}
        />
      {/if}
      <button
        onclick={openAdd}
        class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        + {m.transaction_add()}
      </button>
    </div>
  </div>

  {#if summaryQuery.data}
    <SummaryCards summary={summaryQuery.data} />
  {:else if summaryQuery.isLoading}
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
  {:else if txQuery.data}
    <TransactionTable
      transactions={txQuery.data}
      onedit={(tx: TransactionWithCategory) => {
        editTarget = tx;
        dialogOpen = true;
      }}
      ondelete={(id: string) => (deleteTargetId = id)}
    />
  {/if}

  {#if summaryQuery.data}
    <CategoryBreakdown categories={summaryQuery.data.categories} />
  {/if}
</div>

<TransactionDialog open={dialogOpen} onclose={() => (dialogOpen = false)} initial={editTarget} />

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.common_confirm_delete_description()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMutation.isPending}
/>
