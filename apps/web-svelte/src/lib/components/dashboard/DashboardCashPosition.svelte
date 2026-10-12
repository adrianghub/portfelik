<script lang="ts">
  import CockpitIndicators from "$lib/components/dashboard/CockpitIndicators.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import * as m from "$lib/paraglide/messages";

  let {
    hasAnchor,
    showPrivateDetails,
    scopeLabel,
    transactionsHref,
    balance,
    expenses,
    monthForecast,
    expensesFrom = null,
    expensesIncomplete = false,
    orientational = 0,
    loading = false,
    error = false,
    onRetry,
    onOpenGlossary,
  }: {
    hasAnchor: boolean;
    showPrivateDetails: boolean;
    scopeLabel: string;
    transactionsHref: string;
    balance: number | null;
    expenses: number | null;
    monthForecast: number | null;
    expensesFrom?: string | null;
    expensesIncomplete?: boolean;
    orientational?: number;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
    onOpenGlossary?: (entryId: string) => void;
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
{:else}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 sm:p-5"
    aria-label={m.cash_position_label()}
    data-testid="dashboard-cash-position"
  >
    <p class="mb-3 text-sm font-medium text-slate-300">{scopeLabel}</p>
    <CockpitIndicators
      {balance}
      {expenses}
      forecast={monthForecast}
      {orientational}
      {expensesFrom}
      {expensesIncomplete}
      {onOpenGlossary}
    />
    <div class="mt-2 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1">
      {#if showPrivateDetails && hasAnchor}
        <a
          href={transactionsHref}
          class="focus-visible:ring-accent text-accent inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >{m.cash_position_transactions_link()}</a
        >
      {:else if showPrivateDetails}
        <a
          href="/transactions?group=own"
          class="focus-visible:ring-accent inline-flex min-h-11 items-center text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
          >{m.cockpit_set_opening()}</a
        >
        <InfoTooltip label={m.cockpit_opening_help_label()} text={m.cockpit_opening_help()} />
      {/if}
    </div>
  </section>
{/if}
