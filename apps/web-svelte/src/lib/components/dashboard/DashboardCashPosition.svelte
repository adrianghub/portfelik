<script lang="ts">
  import CashBalanceSummary from "$lib/components/CashBalanceSummary.svelte";
  import * as m from "$lib/paraglide/messages";

  let {
    live,
    forecast,
    upcomingIncome,
    upcomingExpenses,
    anchorDate,
    openingAmount,
    paidIncome,
    paidExpenses,
    hasAnchor,
    loading = false,
    error = false,
    onRetry,
  }: {
    live: number;
    forecast: number;
    upcomingIncome: number;
    upcomingExpenses: number;
    anchorDate?: string;
    openingAmount?: number;
    paidIncome?: number;
    paidExpenses?: number;
    hasAnchor: boolean;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  } = $props();
</script>

{#if loading}
  <div
    class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"
    data-testid="dashboard-cash-loading"
    aria-hidden="true"
  ></div>
{:else if error}
  <section
    class="rounded-2xl border border-rose-500/20 bg-slate-900/60 p-4"
    data-testid="dashboard-cash-position"
    aria-label={m.cash_position_label()}
  >
    <p class="text-sm text-rose-300" role="alert">{m.cash_position_load_error()}</p>
    <button
      type="button"
      onclick={onRetry}
      class="focus-visible:ring-accent text-accent mt-2 inline-flex min-h-11 items-center text-sm focus-visible:ring-2 focus-visible:outline-none"
      >{m.common_retry()}</button
    >
  </section>
{:else if hasAnchor}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 sm:p-5"
    aria-label={m.cash_position_label()}
    data-testid="dashboard-cash-position"
  >
    <CashBalanceSummary
      {live}
      {forecast}
      {upcomingIncome}
      {upcomingExpenses}
      {anchorDate}
      {openingAmount}
      {paidIncome}
      {paidExpenses}
      currentLabel={m.dashboard_cash_now()}
      forecastLabel={m.dashboard_cash_after_upcoming()}
    />
    <a
      href="/transactions?group=own"
      class="focus-visible:ring-accent text-accent mt-2 inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >{m.cash_position_transactions_link()}</a
    >
  </section>
{:else}
  <a
    href="/transactions?group=own"
    class="focus-visible:ring-accent flex min-h-20 items-center rounded-2xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
    >{m.cash_position_set_hint()}</a
  >
{/if}
