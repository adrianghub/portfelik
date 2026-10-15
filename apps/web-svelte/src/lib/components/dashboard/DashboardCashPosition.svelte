<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import CockpitForecastChart from "$lib/components/dashboard/CockpitForecastChart.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import type { CockpitForecastChart as ChartModel } from "$lib/cockpit/forecast-chart";
  import { shortDayMonth } from "$lib/cockpit/month-window";
  import { motionDuration } from "$lib/motion";
  import { forecastTrough } from "$lib/services/forecast-trough";
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency, formatDate, monthNameLocative } from "$lib/utils";

  let {
    hasAnchor,
    showPrivateDetails,
    scopeLabel,
    balance,
    expensesFrom = null,
    expensesIncomplete = false,
    orientational = 0,
    monthForecast,
    upcomingIncome = 0,
    upcomingExpenses = 0,
    chart,
    horizonLabel,
    anchorDate = null,
    analysisHref,
    incomeSourceHref = null,
    expenseSourceHref = null,
    balanceSourceHref = null,
    projected = true,
    demo = false,
    revealCount = null,
    loading = false,
    error = false,
    onRetry,
    onOpenGlossary,
  }: {
    hasAnchor: boolean;
    showPrivateDetails: boolean;
    scopeLabel: string;
    balance: number | null;
    expensesFrom?: string | null;
    expensesIncomplete?: boolean;
    orientational?: number;
    monthForecast: number | null;
    upcomingIncome?: number;
    upcomingExpenses?: number;
    chart: ChartModel;
    horizonLabel: string;
    anchorDate?: string | null;
    analysisHref: string;
    /** Drill from „Skąd ta kwota?” income leg into Transakcje. */
    incomeSourceHref?: string | null;
    expenseSourceHref?: string | null;
    balanceSourceHref?: string | null;
    projected?: boolean;
    demo?: boolean;
    revealCount?: number | null;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
    onOpenGlossary?: (entryId: string) => void;
  } = $props();

  let progress = $state(1);
  let sourceOpen = $state(false);

  const spent = $derived(chart.spent);
  const trough = $derived(
    chart.points && chart.points.length > 0 ? forecastTrough(chart.points) : null
  );
  const expensesFromLabel = $derived(expensesFrom ? shortDayMonth(expensesFrom) : null);
  const heroLabel = $derived(projected ? m.cockpit_forecast_hero() : m.cockpit_closing_hero());
  const spentHelp = $derived.by(() => {
    const parts: string[] = [];
    if (expensesFromLabel) parts.push(m.cockpit_expenses_from_help({ date: expensesFromLabel }));
    if (orientational > 0)
      parts.push(m.cockpit_orientational({ amount: formatCurrency(orientational) }));
    if (expensesIncomplete) parts.push(m.cockpit_expenses_incomplete_help());
    if (parts.length === 0) parts.push(m.cockpit_counters_help());
    return parts.join(" ");
  });
  const spentHelpLabel = $derived(
    expensesIncomplete
      ? m.cockpit_expenses_incomplete_help_label()
      : expensesFromLabel
        ? m.cockpit_expenses_from_help_label()
        : m.cockpit_spent_month()
  );

  function shown(amount: number | null): string {
    if (amount == null) return "-";
    return formatCurrency(amount * progress);
  }

  function accessible(amount: number | null): string {
    return amount == null ? m.cockpit_missing() : formatCurrency(amount);
  }

  function analyzed(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (count === 1) return m.cockpit_analyzed_one({ count });
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return m.cockpit_analyzed_few({ count });
    }
    return m.cockpit_analyzed_many({ count });
  }

  function comparedWith(month: number): string {
    return `${month === 9 ? "we" : "w"} ${monthNameLocative(month)}`;
  }

  onMount(() => {
    if (!browser || revealCount == null || motionDuration(1_000) === 0) return;
    progress = 0;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 1_000);
      progress = 1 - (1 - t) ** 3;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
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
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
    aria-label={m.cash_position_label()}
    data-testid="dashboard-cash-position"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-300">
          {demo ? m.cockpit_sample_data() : scopeLabel}
        </p>
        <p class="mt-0.5 text-xs tracking-wide text-slate-400 uppercase">{horizonLabel}</p>
      </div>
      <a
        href={analysisHref}
        class="text-accent focus-visible:ring-accent inline-flex min-h-11 shrink-0 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        data-testid="cockpit-see-analysis"
      >
        {m.cockpit_see_analysis()}
      </a>
    </div>
    {#if revealCount != null}
      <p class="mt-2 text-sm text-slate-400" data-testid="cockpit-analyzed">
        {analyzed(revealCount)}
      </p>
    {/if}

    <div
      class="mt-2 md:mt-4 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:items-end md:gap-10"
      data-testid="cockpit-indicators"
      data-tour-id="tour-balance-ring"
    >
      <div class="min-w-0">
        <div class="flex items-start justify-between gap-3">
          <p class="min-w-0 text-sm font-medium break-words text-slate-300">{heroLabel}</p>
          <InfoTooltip
            label={m.cockpit_forecast_help_label()}
            text={m.cockpit_forecast_meaning()}
            side="bottom"
            glossaryEntryId="prognoza"
            {onOpenGlossary}
          />
        </div>
        <p
          class="text-hero mt-1 font-semibold tracking-tight break-words {monthForecast != null &&
          monthForecast < 0
            ? 'text-negative'
            : 'text-slate-50'}"
          data-testid="cockpit-forecast"
        >
          {shown(monthForecast)}
        </p>
        {#if showPrivateDetails && hasAnchor && monthForecast != null && projected}
          <button
            type="button"
            class="text-accent focus-visible:ring-accent mt-1 inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            aria-expanded={sourceOpen}
            data-testid="cockpit-amount-source"
            onclick={() => (sourceOpen = !sourceOpen)}
          >
            {sourceOpen ? m.cockpit_amount_source_close() : m.cockpit_amount_source()}
          </button>
          {#if sourceOpen}
            <dl
              class="mt-2 space-y-1.5 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2.5 text-sm"
              data-testid="cockpit-amount-source-panel"
            >
              <div class="flex justify-between gap-3">
                <dt class="text-slate-400">{m.cockpit_amount_source_balance()}</dt>
                <dd class="text-slate-100 tabular-nums">
                  {#if balanceSourceHref}
                    <a
                      href={balanceSourceHref}
                      class="hover:text-accent underline-offset-2 hover:underline"
                      >{formatCurrency(balance ?? 0)}</a
                    >
                  {:else}
                    {formatCurrency(balance ?? 0)}
                  {/if}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-400">{m.cockpit_amount_source_income()}</dt>
                <dd class="text-emerald-300 tabular-nums">
                  {#if incomeSourceHref}
                    <a
                      href={incomeSourceHref}
                      class="underline-offset-2 hover:text-emerald-200 hover:underline"
                      >+{formatCurrency(upcomingIncome)}</a
                    >
                  {:else}
                    +{formatCurrency(upcomingIncome)}
                  {/if}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-400">{m.cockpit_amount_source_expense()}</dt>
                <dd class="text-rose-300 tabular-nums">
                  {#if expenseSourceHref}
                    <a
                      href={expenseSourceHref}
                      class="underline-offset-2 hover:text-rose-200 hover:underline"
                      >−{formatCurrency(upcomingExpenses)}</a
                    >
                  {:else}
                    −{formatCurrency(upcomingExpenses)}
                  {/if}
                </dd>
              </div>
              <div class="flex justify-between gap-3 border-t border-white/5 pt-1.5 font-medium">
                <dt class="text-slate-300">{m.cockpit_amount_source_result()}</dt>
                <dd class="text-slate-50 tabular-nums">{formatCurrency(monthForecast)}</dd>
              </div>
            </dl>
          {/if}
        {/if}
        {#if trough && trough.date && showPrivateDetails && hasAnchor}
          <p class="mt-2 text-sm text-slate-400" data-testid="cockpit-lowest-balance">
            {m.cockpit_lowest_balance_on({
              amount: formatCurrency(trough.balance),
              date: formatDate(trough.date),
            })}
          </p>
        {/if}
        {#if chart.points && chart.points.length > 1 && chart.domainStart && chart.domainEnd}
          <div class="mt-1">
            <CockpitForecastChart
              points={chart.points}
              todayRatio={chart.todayRatio}
              rangeStart={chart.domainStart}
              rangeEnd={chart.domainEnd}
              reveal={revealCount != null}
            />
          </div>
          {#if chart.coverage === "clipped" && anchorDate}
            <p class="mt-1 text-xs text-slate-400" data-testid="cockpit-chart-from-anchor">
              {m.cockpit_chart_from_anchor({ date: shortDayMonth(anchorDate) })}
            </p>
          {/if}
        {:else if showPrivateDetails && chart.coverage === "missing"}
          <p class="mt-3 text-sm text-slate-300" data-testid="cockpit-forecast-needs-balance">
            {m.cockpit_forecast_needs_balance()}
          </p>
        {:else if showPrivateDetails && chart.coverage === "before" && anchorDate}
          <p class="mt-3 text-sm text-slate-300" data-testid="cockpit-chart-before-anchor">
            {m.cockpit_chart_before_anchor({ date: shortDayMonth(anchorDate) })}
          </p>
        {/if}
      </div>

      <div
        class="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-x-3 gap-y-2 md:mt-0 md:grid-cols-1 md:gap-8"
      >
        <div
          class="min-w-0"
          data-testid="cockpit-balance"
          aria-label="{m.cockpit_balance_today()}: {accessible(balance)}"
        >
          <div class="flex min-w-0 items-start gap-1">
            <p class="min-w-0 text-sm break-words text-slate-400">{m.cockpit_balance_today()}</p>
            <InfoTooltip
              label={m.cockpit_counters_help_label()}
              text={m.cockpit_counters_help()}
              side="bottom"
            />
          </div>
          <p
            class="mt-1 text-xl font-semibold tracking-tight break-words tabular-nums md:text-2xl {balance !=
              null && balance < 0
              ? 'text-negative'
              : ''}"
          >
            {shown(balance)}
          </p>
        </div>
        <div
          class="min-w-0"
          data-testid="cockpit-payments"
          aria-label="{m.cockpit_spent_month()}: {accessible(spent)}"
        >
          <div class="flex min-w-0 items-start gap-1">
            <p class="min-w-0 text-sm break-words text-slate-400">{m.cockpit_spent_month()}</p>
            <InfoTooltip label={spentHelpLabel} text={spentHelp} side="bottom" />
          </div>
          <p class="mt-1 text-xl font-semibold tracking-tight break-words tabular-nums md:text-2xl">
            {shown(spent)}
          </p>
          {#if chart.comparison}
            <p
              class="mt-1.5 text-sm font-medium break-words {chart.comparison.percent < 0
                ? 'text-positive'
                : 'text-negative'}"
            >
              {chart.comparison.percent < 0
                ? m.cockpit_vs_less({
                    percent: Math.abs(chart.comparison.percent),
                    when: comparedWith(chart.comparison.month),
                  })
                : m.cockpit_vs_more({
                    percent: chart.comparison.percent,
                    when: comparedWith(chart.comparison.month),
                  })}
            </p>
          {/if}
        </div>
      </div>
    </div>

    {#if showPrivateDetails && !hasAnchor}
      <div class="mt-2 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href="/transactions?group=own"
          class="focus-visible:ring-accent inline-flex min-h-11 items-center text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
          >{m.cockpit_set_opening()}</a
        >
        <InfoTooltip
          label={m.cockpit_opening_help_label()}
          text={m.cockpit_opening_help()}
          side="bottom"
        />
      </div>
    {/if}
  </section>
{/if}
