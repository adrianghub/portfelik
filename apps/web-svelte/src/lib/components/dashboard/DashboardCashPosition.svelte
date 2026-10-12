<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import CockpitForecastChart from "$lib/components/dashboard/CockpitForecastChart.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import type { CockpitForecastChart as ChartModel } from "$lib/cockpit/forecast-chart";
  import { shortDayMonth } from "$lib/cockpit/month-window";
  import { motionDuration } from "$lib/motion";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency, monthNameLocative } from "$lib/utils";

  let {
    hasAnchor,
    showPrivateDetails,
    scopeLabel,
    monthLabel,
    onMonthShift,
    balance,
    expensesFrom = null,
    expensesIncomplete = false,
    orientational = 0,
    monthForecast,
    chart,
    rangeStart,
    rangeEnd,
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
    monthLabel: string;
    onMonthShift: (delta: number) => void;
    balance: number | null;
    expensesFrom?: string | null;
    expensesIncomplete?: boolean;
    orientational?: number;
    monthForecast: number | null;
    chart: ChartModel;
    rangeStart: string;
    rangeEnd: string;
    projected?: boolean;
    demo?: boolean;
    revealCount?: number | null;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
    onOpenGlossary?: (entryId: string) => void;
  } = $props();

  let progress = $state(1);

  const spent = $derived(chart.spent);
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
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 sm:p-5"
    aria-label={m.cash_position_label()}
    data-testid="dashboard-cash-position"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="focus-visible:ring-accent inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.cockpit_month_previous()}
          onclick={() => onMonthShift(-1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p class="text-eyebrow truncate text-slate-300" data-testid="cockpit-month">{monthLabel}</p>
        <button
          type="button"
          class="focus-visible:ring-accent inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.cockpit_month_next()}
          onclick={() => onMonthShift(1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <p class="shrink-0 text-xs text-slate-400">
        {demo ? m.cockpit_sample_data() : scopeLabel}
      </p>
    </div>
    {#if revealCount != null}
      <p class="mt-3 text-sm text-slate-400" data-testid="cockpit-analyzed">
        {analyzed(revealCount)}
      </p>
    {/if}

    <div
      class="mt-4 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:items-end md:gap-10"
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
            ? 'text-rose-400'
            : 'text-slate-50'}"
          data-testid="cockpit-forecast"
        >
          {shown(monthForecast)}
        </p>
        {#if chart.points && chart.points.length > 1}
          <div class="mt-2">
            <CockpitForecastChart
              points={chart.points}
              todayRatio={chart.todayRatio}
              {rangeStart}
              {rangeEnd}
              reveal={revealCount != null}
            />
          </div>
        {/if}
      </div>

      <div class="mt-5 grid min-w-0 gap-6 md:mt-0 md:gap-8">
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
            class="mt-1 text-2xl font-semibold tracking-tight break-words tabular-nums {balance !=
              null && balance < 0
              ? 'text-rose-400'
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
          <p class="mt-1 text-2xl font-semibold tracking-tight break-words tabular-nums">
            {shown(spent)}
          </p>
          {#if chart.comparison}
            <p
              class="mt-1.5 text-sm font-medium break-words {chart.comparison.percent < 0
                ? 'text-emerald-400'
                : 'text-rose-400'}"
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

    <div class="mt-2 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
      {#if showPrivateDetails && hasAnchor}
        <a
          href="/transactions?group=own"
          class="focus-visible:ring-accent text-accent inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >{m.cash_position_transactions_link()}</a
        >
      {:else if showPrivateDetails}
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
      {/if}
    </div>
  </section>
{/if}
