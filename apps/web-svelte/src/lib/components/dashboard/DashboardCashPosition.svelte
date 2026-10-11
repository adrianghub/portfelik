<script lang="ts">
  import CashBalanceSummary from "$lib/components/CashBalanceSummary.svelte";
  import CockpitIndicators from "$lib/components/dashboard/CockpitIndicators.svelte";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";
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
    showPrivateDetails,
    scopeLabel,
    monthLabel,
    onMonthShift,
    balance,
    expenses,
    monthForecast,
    expensesFrom = null,
    orientational = 0,
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
    showPrivateDetails: boolean;
    scopeLabel: string;
    monthLabel: string;
    onMonthShift: (delta: number) => void;
    balance: number | null;
    expenses: number | null;
    monthForecast: number | null;
    expensesFrom?: string | null;
    orientational?: number;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  } = $props();

  let openingHelpOpen = $state(false);
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
{:else}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 sm:p-5"
    aria-label={m.cash_position_label()}
    data-testid="dashboard-cash-position"
  >
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium text-slate-300">{scopeLabel}</p>
      <div class="flex items-center gap-1" role="group" aria-label={m.cockpit_month_nav()}>
        <button
          type="button"
          class="focus-visible:ring-accent inline-flex size-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.cockpit_month_previous()}
          onclick={() => onMonthShift(-1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p class="px-1 text-center text-sm font-medium text-slate-100" data-testid="cockpit-month">
          {monthLabel}
        </p>
        <button
          type="button"
          class="focus-visible:ring-accent inline-flex size-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.cockpit_month_next()}
          onclick={() => onMonthShift(1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
    <CockpitIndicators
      {balance}
      {expenses}
      forecast={monthForecast}
      {orientational}
      {expensesFrom}
    />
    {#if showPrivateDetails && hasAnchor}
      <div class="mt-3">
        <CashBalanceSummary
          {live}
          {forecast}
          {upcomingIncome}
          {upcomingExpenses}
          {anchorDate}
          {openingAmount}
          {paidIncome}
          {paidExpenses}
          currentLabel={m.cockpit_today_now()}
          forecastLabel={m.cockpit_today_horizon()}
          calculationTitle={m.cockpit_today_calculation_title()}
          scopeHint={m.cockpit_today_hint()}
          showHeadlines={false}
        />
      </div>
      <a
        href="/transactions?group=own"
        class="focus-visible:ring-accent text-accent mt-2 inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >{m.cash_position_transactions_link()}</a
      >
    {:else if showPrivateDetails}
      <div class="mt-3 flex min-h-11 items-center gap-1">
        <a
          href="/transactions?group=own"
          class="focus-visible:ring-accent inline-flex min-h-11 items-center text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
          >{m.cockpit_set_opening()}</a
        >
        <button
          type="button"
          class="focus-visible:ring-accent inline-flex size-8 items-center justify-center rounded-full text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
          aria-expanded={openingHelpOpen}
          aria-controls="cockpit-opening-help"
          aria-label={m.cockpit_opening_help_label()}
          onclick={() => (openingHelpOpen = !openingHelpOpen)}>?</button
        >
      </div>
      {#if openingHelpOpen}
        <p id="cockpit-opening-help" class="pb-1 text-xs leading-relaxed text-slate-400">
          {m.cockpit_opening_help()}
        </p>
      {/if}
    {/if}
  </section>
{/if}
