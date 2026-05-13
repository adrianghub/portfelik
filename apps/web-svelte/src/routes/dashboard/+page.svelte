<script lang="ts">
  import { goto } from "$app/navigation";
  import SummaryCards from "$lib/components/transactions/SummaryCards.svelte";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchProfile } from "$lib/services/profiles";
  import { computeSummary, fetchTransactions } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import type { TransactionWithCategory } from "$lib/types";
  import { getDateRangeBounds } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { Plus } from "lucide-svelte";

  let userId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id ?? null;
  });

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  }));

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const bounds = getDateRangeBounds(year, month, year, month);

  const txQuery = createQuery(() => ({
    queryKey: ["transactions", year, month, year, month, undefined],
    queryFn: () => fetchTransactions(bounds.start, bounds.end),
  }));

  const summary = $derived(txQuery.data ? computeSummary(txQuery.data) : null);

  const upcomingTxs = $derived(
    txQuery.data?.filter((tx) => tx.status === "upcoming" || tx.status === "overdue").slice(0, 5) ??
      []
  );

  function openTransaction(tx: TransactionWithCategory) {
    goto(`/transactions?status=${tx.status}`);
  }
</script>

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      {#if profileQuery.data}
        <p class="mb-0.5 text-sm text-slate-500 dark:text-slate-400">
          {m.transactions_greeting({ name: profileQuery.data.name ?? profileQuery.data.email })}
        </p>
      {/if}
      <h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {m.dashboard_title()}
      </h1>
      <p class="mt-0.5 text-xs text-slate-400">{m.dashboard_month_label()}</p>
    </div>
    <!-- Quick-add FAB (mobile) -->
    <button
      type="button"
      onclick={() => goto("/transactions")}
      class="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md hover:bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden"
      aria-label="Dodaj transakcję"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  </div>

  <!-- Summary cards -->
  {#if txQuery.isPending}
    <div class="grid gap-3 sm:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <div
          class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div class="mb-2 h-3 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-700"></div>
          <div class="h-6 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-700"></div>
        </div>
      {/each}
    </div>
  {:else if summary}
    <SummaryCards {summary} />
  {/if}

  <!-- Upcoming / overdue -->
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
        {m.dashboard_upcoming_title()}
      </p>
      {#if upcomingTxs.length > 0}
        <a
          href="/transactions?status=upcoming,overdue"
          class="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {m.dashboard_upcoming_see_all()}
        </a>
      {/if}
    </div>

    {#if txQuery.isPending}
      <div class="space-y-2">
        {#each Array(3) as _, i (i)}
          <div class="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"></div>
        {/each}
      </div>
    {:else if upcomingTxs.length === 0}
      <p class="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
        {m.dashboard_empty_upcoming()}
      </p>
    {:else}
      <TransactionTable
        transactions={upcomingTxs}
        selectedIds={new Set()}
        onrowclick={openTransaction}
      />
    {/if}
  </div>
</div>
