<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { analysisBalanceHelp } from "$lib/analysis/balance-help";
  import BudgetCategoryHistory from "$lib/components/analysis/BudgetCategoryHistory.svelte";
  import CockpitForecastChart from "$lib/components/dashboard/CockpitForecastChart.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import {
    analysisWindow,
    buildAnalysisOverview,
    previousAnalysisWindow,
    type AnalysisFlow,
    type AnalysisSpan,
  } from "$lib/analysis/overview";
  import { session } from "$lib/auth/session.svelte";
  import { axisDayLabel } from "$lib/cockpit/forecast-chart";
  import { addLocalDays, localDateIso } from "$lib/date-local";
  import * as m from "$lib/paraglide/messages";
  import { qk } from "$lib/query-keys";
  import { fetchUserGroups } from "$lib/services/groups";
  import { fetchPrivateCashPosition } from "$lib/services/cash-position";
  import { fetchEarliestTransactionDate, fetchTransactions } from "$lib/services/transactions";
  import { cn, formatCurrency, monthName } from "$lib/utils";
  import { parseScopeFilter } from "$lib/utils/list-view-url";
  import { createQuery } from "@tanstack/svelte-query";

  const spans: { value: AnalysisSpan; label: string }[] = [
    { value: "all", label: m.analysis_span_all() },
    { value: "year", label: m.analysis_span_year() },
    { value: "month", label: m.analysis_span_month() },
    { value: "week", label: m.analysis_span_week() },
  ];

  const span = $derived.by<AnalysisSpan>(() => {
    const raw = $page.url.searchParams.get("span");
    if (raw === "year" || raw === "month" || raw === "week" || raw === "all") return raw;
    return "all";
  });
  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));
  const today = $derived(localDateIso());

  const cashAnchorQuery = createQuery(() => ({
    queryKey: qk.cashPosition(session.userId!),
    queryFn: fetchPrivateCashPosition,
    enabled: !!session.userId,
  }));
  const groupsQuery = createQuery(() => ({
    queryKey: qk.userGroups(session.userId!),
    queryFn: fetchUserGroups,
    enabled: !!session.userId && groupFilter !== "own" && groupFilter !== "all",
  }));

  const anchorReady = $derived(cashAnchorQuery.isSuccess || cashAnchorQuery.isError);
  const anchor = $derived(
    cashAnchorQuery.data
      ? {
          opening_amount: cashAnchorQuery.data.opening_amount,
          as_of_date: cashAnchorQuery.data.as_of_date.slice(0, 10),
          balance_semantics: cashAnchorQuery.data.balance_semantics,
        }
      : null
  );
  const needsEarliest = $derived(span === "all" && anchorReady);
  const earliestQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "analysis-earliest"),
    queryFn: fetchEarliestTransactionDate,
    enabled: !!session.userId && needsEarliest,
  }));
  const fetchBounds = $derived.by(() => {
    if (!anchorReady) return null;
    if (needsEarliest && !earliestQuery.isSuccess) return null;
    const window = analysisWindow(
      span,
      today,
      anchor?.as_of_date ?? null,
      needsEarliest ? (earliestQuery.data ?? null) : null
    );
    const previous = previousAnalysisWindow(window.start, window.end);
    const dates = [
      anchor?.as_of_date,
      window.start,
      previous.start,
      needsEarliest ? earliestQuery.data : null,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    return { start: dates.sort()[0] ?? window.start, endExclusive: addLocalDays(window.end, 1) };
  });

  const ledgerQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "analysis",
      fetchBounds?.start ?? "",
      fetchBounds?.endExclusive ?? ""
    ),
    queryFn: () => fetchTransactions(fetchBounds!.start, fetchBounds!.endExclusive),
    enabled: !!session.userId && fetchBounds != null,
  }));

  const scopeLabel = $derived.by(() => {
    if (groupFilter === "all") return m.dashboard_scope_all();
    if (groupFilter === "own") return m.dashboard_scope_own();
    return (
      groupsQuery.data?.find((group) => group.id === groupFilter)?.name ?? m.visual_icon_home()
    );
  });

  const overview = $derived.by(() => {
    const rows: AnalysisFlow[] = (ledgerQuery.data ?? [])
      .filter((row) => {
        const groupId = row.group_id ?? null;
        if (groupFilter === "all") return true;
        if (groupFilter === "own") return groupId === null;
        return groupId === groupFilter;
      })
      .map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        status: row.status,
        date: row.date,
        currency: row.currency,
        categoryId: row.category_id,
        categoryName: row.category_name,
      }));
    return buildAnalysisOverview({
      span,
      today,
      anchor,
      balanceScope: groupFilter === "own",
      rows,
    });
  });

  const balanceSemantics = $derived(
    anchor?.balance_semantics === "end_of_day" ? "end_of_day" : "start_of_day"
  );
  const balanceChartReady = $derived(
    !!overview.chart?.points &&
      overview.chart.points.length > 1 &&
      !!overview.chart.domainStart &&
      !!overview.chart.domainEnd
  );
  const balanceHelp = $derived(
    anchor && overview.anchorDate
      ? analysisBalanceHelp({
          reconstructed: overview.reconstructed,
          semantics: balanceSemantics,
          anchorDate: overview.anchorDate,
          clippedFrom:
            overview.coverage === "clipped" && overview.chart?.domainStart
              ? overview.chart.domainStart
              : null,
        })
      : ""
  );
  const maxBar = $derived(
    Math.max(1, ...overview.bars.flatMap((bar) => [bar.income, bar.expense]))
  );
  const loading = $derived(
    !session.userId ||
      cashAnchorQuery.isPending ||
      (needsEarliest && earliestQuery.isPending) ||
      ledgerQuery.isLoading
  );
  const failed = $derived(ledgerQuery.isError || (needsEarliest && earliestQuery.isError));

  function setSpan(next: AnalysisSpan) {
    const params = new URLSearchParams($page.url.searchParams);
    if (next === "all") params.delete("span");
    else params.set("span", next);
    const query = params.toString();
    void goto(query ? `/analysis?${query}` : "/analysis", { keepFocus: true, noScroll: true });
  }

  function barLabel(key: string): string {
    if (key.length === 10) return axisDayLabel(key);
    return monthName(Number(key.slice(5, 7)));
  }

  function categoryName(name: string): string {
    return name.trim() || m.analysis_uncategorized();
  }
</script>

<svelte:head>
  <title>{m.analysis_title()} · JakStoimy</title>
</svelte:head>

<div class="container mx-auto max-w-4xl min-w-0 space-y-4 px-4 py-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-slate-100">{m.analysis_title()}</h1>
    <p class="mt-1 text-sm text-slate-400">{m.analysis_intro()}</p>
    <p class="mt-2 text-sm font-medium text-slate-300">{scopeLabel}</p>
  </div>

  <div role="tablist" aria-label={m.analysis_title()} class="flex flex-wrap gap-2">
    {#each spans as item (item.value)}
      <button
        type="button"
        role="tab"
        aria-selected={span === item.value}
        class={cn(
          "focus-visible:ring-accent min-h-11 rounded-full px-3.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
          span === item.value
            ? "bg-accent-gradient text-slate-900"
            : "bg-white/5 text-slate-300 hover:bg-white/10"
        )}
        onclick={() => setSpan(item.value)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  {:else if failed}
    <QueryError
      error={ledgerQuery.error ?? earliestQuery.error}
      onRetry={() => {
        if (needsEarliest && earliestQuery.isError) void earliestQuery.refetch();
        if (ledgerQuery.isError) void ledgerQuery.refetch();
      }}
    />
  {:else}
    <section
      class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
      aria-label={m.analysis_balance_title()}
      data-testid="analysis-balance"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium text-slate-300">{m.analysis_balance_title()}</h2>
        {#if balanceChartReady && balanceHelp}
          <InfoTooltip label={m.analysis_balance_help_label()} text={balanceHelp} side="bottom" />
        {/if}
      </div>
      {#if balanceChartReady && overview.chart?.domainStart && overview.chart.domainEnd && overview.chart.points}
        <div class="mt-2">
          <CockpitForecastChart
            points={overview.chart.points}
            todayRatio={overview.chart.todayRatio}
            rangeStart={overview.chart.domainStart}
            rangeEnd={overview.chart.domainEnd}
            historyLabel={m.analysis_chart_history()}
            confirmOnScrub={balanceSemantics === "end_of_day"}
            legend="forecast-only"
          />
        </div>
        <div class="mt-2 flex items-start justify-between gap-3 text-xs text-slate-400">
          <p data-testid="analysis-balance-source">{m.analysis_balance_source()}</p>
          {#if balanceSemantics === "end_of_day"}
            <p class="shrink-0 text-slate-500" data-testid="analysis-confirmed-caption">
              {m.analysis_confirmed_caption()}
            </p>
          {/if}
        </div>
      {:else if overview.coverage === "missing"}
        <p class="mt-3 text-sm text-slate-300">{m.analysis_balance_missing()}</p>
        <a
          href="/transactions?group=own"
          class="text-accent focus-visible:ring-accent mt-1 inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          {m.cockpit_set_opening()}
        </a>
      {:else if overview.coverage === "before"}
        <p class="mt-3 text-sm text-slate-300">{m.analysis_balance_before()}</p>
      {:else if overview.coverage === "private-only"}
        <p class="mt-3 text-sm text-slate-300">{m.analysis_balance_private()}</p>
      {/if}
    </section>

    <section
      class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
      aria-label={m.analysis_flows_title()}
      data-testid="analysis-flows"
    >
      <h2 class="text-sm font-medium text-slate-300">{m.analysis_flows_title()}</h2>
      {#if overview.income === 0 && overview.expense === 0}
        <p class="mt-3 text-sm text-slate-400">{m.analysis_empty()}</p>
      {:else}
        <div class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p class="text-sm text-slate-400">{m.analysis_income()}</p>
            <p class="text-positive mt-1 text-xl font-semibold tabular-nums">
              {formatCurrency(overview.income)}
            </p>
          </div>
          <div>
            <p class="text-sm text-slate-400">{m.analysis_expense()}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums">
              {formatCurrency(overview.expense)}
            </p>
          </div>
        </div>
      {/if}
    </section>

    {#if overview.bars.some((bar) => bar.income > 0 || bar.expense > 0)}
      <section
        class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
        aria-label={overview.barKind === "day"
          ? m.analysis_days_title()
          : m.analysis_months_title()}
        data-testid="analysis-bars"
      >
        <h2 class="text-sm font-medium text-slate-300">
          {overview.barKind === "day" ? m.analysis_days_title() : m.analysis_months_title()}
        </h2>
        <div class="mt-3 flex gap-3 overflow-x-auto pb-1">
          {#each overview.bars as bar (bar.key)}
            <div class="w-14 shrink-0">
              <div class="flex h-24 items-end justify-center gap-1">
                <div
                  class="bg-positive w-2 rounded-sm"
                  style="height: {(bar.income / maxBar) * 100}%"
                ></div>
                <div
                  class="w-2 rounded-sm"
                  style="height: {(bar.expense / maxBar) *
                    100}%; background: var(--color-chart-primary)"
                ></div>
              </div>
              <p class="mt-1 truncate text-center text-[11px] text-slate-400">
                {barLabel(bar.key)}
              </p>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <BudgetCategoryHistory
      {groupFilter}
      period={span === "all" ? "custom" : span}
      historyKind={span === "week" ? "week" : span === "year" ? "year" : "month"}
      customRange={span === "all" ? { start: overview.start, end: overview.end } : null}
    />

    {#if overview.shifts.length > 0}
      <section
        class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
        aria-label={m.analysis_shifts_title()}
        data-testid="analysis-shifts"
      >
        <h2 class="text-sm font-medium text-slate-300">{m.analysis_shifts_title()}</h2>
        <ul class="mt-3 space-y-2">
          {#each overview.shifts as shift (shift.id)}
            <li class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate text-slate-200">{categoryName(shift.name)}</span>
              <span class="shrink-0 {shift.delta > 0 ? 'text-negative' : 'text-positive'}">
                {shift.delta > 0
                  ? m.analysis_shift_up({ amount: formatCurrency(shift.delta) })
                  : m.analysis_shift_down({ amount: formatCurrency(Math.abs(shift.delta)) })}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>
