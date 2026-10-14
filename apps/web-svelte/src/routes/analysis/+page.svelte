<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    analysisForecastEnd,
    buildAnalysisForecast,
    type ForecastHorizon,
  } from "$lib/analysis/forecast";
  import { analysisBalanceHelp } from "$lib/analysis/balance-help";
  import BudgetCategoryHistory from "$lib/components/analysis/BudgetCategoryHistory.svelte";
  import CockpitForecastChart from "$lib/components/dashboard/CockpitForecastChart.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import {
    analysisWindow,
    validAnalysisRange,
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
  import { CASH_FETCH_END_SENTINEL, fetchPrivateCashPosition } from "$lib/services/cash-position";
  import { fetchRecurringOccurrenceSkips } from "$lib/services/recurring-occurrences";
  import { fetchPrivateSpendForecastSource } from "$lib/services/spend-forecast";
  import {
    fetchRecurringTemplates,
    fetchEarliestTransactionDate,
    fetchTransactions,
  } from "$lib/services/transactions";
  import { cn, formatCurrency, monthName } from "$lib/utils";
  import { parseScopeFilter } from "$lib/utils/list-view-url";
  import { createQuery } from "@tanstack/svelte-query";

  const spans: { value: AnalysisSpan; label: string }[] = [
    { value: "30days", label: m.analysis_span_30days() },
    { value: "90days", label: m.analysis_span_90days() },
    { value: "all", label: m.analysis_span_all() },
    { value: "year", label: m.analysis_span_year() },
    { value: "month", label: m.analysis_span_month() },
    { value: "week", label: m.analysis_span_week() },
    { value: "custom", label: m.analysis_span_custom() },
  ];

  const span = $derived.by<AnalysisSpan>(() => {
    const raw = $page.url.searchParams.get("span");
    if (spans.some((item) => item.value === raw) || raw === "week") return raw as AnalysisSpan;
    return "all";
  });
  const mode = $derived($page.url.searchParams.get("mode") === "forecast" ? "forecast" : "history");
  const horizons: { value: ForecastHorizon; label: string }[] = [
    { value: "month", label: m.analysis_horizon_month() },
    { value: "year", label: m.analysis_horizon_year() },
    { value: "3months", label: m.analysis_horizon_3months() },
    { value: "6months", label: m.analysis_horizon_6months() },
    { value: "12months", label: m.analysis_horizon_12months() },
  ];
  const horizon = $derived.by<ForecastHorizon>(() => {
    const raw = $page.url.searchParams.get("horizon");
    return horizons.some((item) => item.value === raw) ? (raw as ForecastHorizon) : "year";
  });
  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));
  const today = $derived(localDateIso());
  const forecastEnd = $derived(analysisForecastEnd(today, horizon));
  const forecastActive = $derived(mode === "forecast" && groupFilter === "own");
  let selectedForecastDate = $state("");
  $effect(() => {
    void forecastEnd;
    selectedForecastDate = "";
  });

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
  const customRange = $derived({
    start: $page.url.searchParams.get("from") ?? addLocalDays(today, -29),
    end: $page.url.searchParams.get("to") ?? today,
  });
  let customFrom = $state("");
  let customTo = $state("");
  let selectedHistoryDate = $state("");
  $effect(() => {
    customFrom = customRange.start;
    customTo = customRange.end;
  });
  const needsEarliest = $derived(anchorReady);
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
      needsEarliest ? (earliestQuery.data ?? null) : null,
      customRange
    );
    const previous = previousAnalysisWindow(window.start, window.end);
    const dates = [
      anchor?.as_of_date,
      window.start,
      previous.start,
      needsEarliest ? earliestQuery.data : null,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    return {
      start: dates.sort()[0] ?? window.start,
      endExclusive:
        mode === "forecast"
          ? CASH_FETCH_END_SENTINEL
          : addLocalDays([window.end, anchor?.as_of_date ?? today, today].sort().at(-1)!, 1),
    };
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

  const templatesQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "recurring-templates"),
    queryFn: fetchRecurringTemplates,
    enabled: !!session.userId && forecastActive,
  }));
  const skipsQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "analysis-recurring-skips", today, forecastEnd),
    queryFn: () => fetchRecurringOccurrenceSkips(today, addLocalDays(forecastEnd, 1)),
    enabled: !!session.userId && forecastActive,
  }));
  const spendQuery = createQuery(() => ({
    queryKey: qk.spendForecast(session.userId!),
    queryFn: fetchPrivateSpendForecastSource,
    enabled: !!session.userId && forecastActive && !!anchor,
  }));
  const forecast = $derived(
    buildAnalysisForecast({
      today,
      end: forecastEnd,
      anchor: groupFilter === "own" ? anchor : null,
      rows: ledgerQuery.data ?? [],
      templates: templatesQuery.data ?? [],
      skipped: skipsQuery.data ?? [],
      spend: spendQuery.data,
    })
  );
  const forecastError = $derived(
    forecastActive ? (templatesQuery.error ?? skipsQuery.error ?? spendQuery.error) : null
  );
  const forecastPoint = $derived(
    forecast?.points.find((point) => point.date === (selectedForecastDate || forecastEnd))
  );

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
      customRange,
    });
  });

  const historyWindowKey = $derived(`${overview.start}:${overview.end}`);
  $effect(() => {
    if (mode === "history") {
      void historyWindowKey;
      selectedHistoryDate = "";
    }
  });

  const balanceSemantics = $derived(
    anchor?.balance_semantics === "end_of_day" ? "end_of_day" : "start_of_day"
  );
  const balanceChartReady = $derived(
    !!overview.chart?.points &&
      overview.chart.points.length > 0 &&
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
      ledgerQuery.isLoading ||
      (forecastActive && (templatesQuery.isLoading || skipsQuery.isLoading || spendQuery.isLoading))
  );
  const failed = $derived(
    cashAnchorQuery.isError ||
      ledgerQuery.isError ||
      (needsEarliest && earliestQuery.isError) ||
      !!forecastError
  );

  function setSpan(next: AnalysisSpan) {
    const params = new URLSearchParams($page.url.searchParams);
    if (next === "all") params.delete("span");
    else params.set("span", next);
    const query = params.toString();
    void goto(query ? `/analysis?${query}` : "/analysis", { keepFocus: true, noScroll: true });
  }

  function applyCustomRange() {
    if (!validAnalysisRange({ start: customFrom, end: customTo }, today)) return;
    const params = new URLSearchParams($page.url.searchParams);
    params.set("span", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    void goto(`/analysis?${params}`, { keepFocus: true, noScroll: true });
  }

  const selectedPoint = $derived(
    overview.chart?.points?.find((point) => point.date === (selectedHistoryDate || overview.end))
  );
  const balanceChange = $derived(
    overview.chart?.points?.length
      ? overview.chart.points.at(-1)!.balance - overview.chart.points[0].balance
      : null
  );

  function setMode(next: "history" | "forecast") {
    const params = new URLSearchParams($page.url.searchParams);
    if (next === "history") params.delete("mode");
    else params.set("mode", next);
    void goto(`/analysis?${params}`, { keepFocus: true, noScroll: true });
  }
  function setHorizon(next: ForecastHorizon) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("horizon", next);
    void goto(`/analysis?${params}`, { keepFocus: true, noScroll: true });
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

  <div role="tablist" aria-label={m.analysis_mode_label()} class="flex gap-2">
    {#each [{ value: "history" as const, label: m.analysis_mode_history() }, { value: "forecast" as const, label: m.analysis_mode_forecast() }] as item (item.value)}
      <button
        type="button"
        role="tab"
        aria-selected={mode === item.value}
        class={cn(
          "focus-visible:ring-accent min-h-11 rounded-xl px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
          mode === item.value ? "bg-accent-gradient text-slate-900" : "bg-white/5 text-slate-300"
        )}
        onclick={() => setMode(item.value)}>{item.label}</button
      >
    {/each}
  </div>

  {#if mode === "history"}
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

    {#if span === "custom"}
      <div class="rounded-2xl border border-white/5 bg-slate-900/60 p-3">
        <div class="grid gap-3 sm:grid-cols-3 sm:items-end">
          <DayPicker label={m.analysis_range_from()} bind:value={customFrom} max={today} />
          <DayPicker label={m.analysis_range_to()} bind:value={customTo} max={today} />
          <button
            type="button"
            class="bg-accent-gradient min-h-11 rounded-xl px-4 text-sm font-medium text-slate-900 disabled:opacity-40"
            disabled={!validAnalysisRange({ start: customFrom, end: customTo }, today)}
            onclick={applyCustomRange}>{m.analysis_apply_range()}</button
          >
        </div>
        {#if !validAnalysisRange({ start: customFrom, end: customTo }, today)}<p
            class="text-negative mt-2 text-sm"
          >
            {m.analysis_invalid_range()}
          </p>{/if}
      </div>
    {/if}
  {:else}
    <div role="tablist" aria-label={m.analysis_forecast_horizon()} class="flex flex-wrap gap-2">
      {#each horizons as item (item.value)}
        <button
          type="button"
          role="tab"
          aria-selected={horizon === item.value}
          class={cn(
            "focus-visible:ring-accent min-h-11 rounded-full px-3.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
            horizon === item.value
              ? "bg-accent-gradient text-slate-900"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          )}
          onclick={() => setHorizon(item.value)}>{item.label}</button
        >
      {/each}
    </div>
  {/if}

  {#if loading}
    <div class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  {:else if failed}
    <QueryError
      error={cashAnchorQuery.error ?? ledgerQuery.error ?? earliestQuery.error ?? forecastError}
      onRetry={() => {
        if (cashAnchorQuery.isError) void cashAnchorQuery.refetch();
        if (needsEarliest && earliestQuery.isError) void earliestQuery.refetch();
        if (ledgerQuery.isError) void ledgerQuery.refetch();
        if (forecastActive && templatesQuery.isError) void templatesQuery.refetch();
        if (forecastActive && skipsQuery.isError) void skipsQuery.refetch();
        if (forecastActive && spendQuery.isError) void spendQuery.refetch();
      }}
    />
  {:else if mode === "forecast"}
    <section
      class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
      data-testid="analysis-forecast"
      aria-label={m.analysis_forecast_title()}
    >
      <h2 class="text-sm font-medium text-slate-300">{m.analysis_forecast_title()}</h2>
      {#if forecast}
        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p class="text-xs text-slate-400">{m.analysis_forecast_today()}</p>
            <p
              class="mt-1 text-lg font-semibold tabular-nums"
              data-testid="analysis-forecast-today"
            >
              {formatCurrency(forecast.balance)}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-400">{m.analysis_forecast_final()}</p>
            <p
              class="mt-1 text-lg font-semibold tabular-nums"
              data-testid="analysis-forecast-final"
            >
              {formatCurrency(forecast.finalBalance)}
            </p>
            <p class="text-xs text-slate-500">
              {axisDayLabel(forecast.end)}
              {forecast.end.slice(0, 4)}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-400">{m.analysis_forecast_income()}</p>
            <p
              class="text-positive mt-1 text-lg font-semibold tabular-nums"
              data-testid="analysis-forecast-income"
            >
              {formatCurrency(forecast.income)}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-400">{m.analysis_forecast_expense()}</p>
            <p
              class="mt-1 text-lg font-semibold tabular-nums"
              data-testid="analysis-forecast-expense"
            >
              {formatCurrency(forecast.expense)}
            </p>
          </div>
        </div>
        {#if forecast.points.length > 1}
          <div class="mt-4">
            <CockpitForecastChart
              points={forecast.points}
              historyLabel={m.analysis_forecast_today()}
              todayRatio={0}
              rangeStart={forecast.start}
              rangeEnd={forecast.end}
              legend="forecast-only"
            />
          </div>
        {/if}
        <div class="mt-3 grid items-end gap-3 sm:grid-cols-2">
          <DayPicker
            label={m.analysis_forecast_on_day()}
            value={selectedForecastDate || forecastEnd}
            max={forecastEnd}
            onchange={(date) => (selectedForecastDate = date)}
          />
          <p class="text-xl font-semibold tabular-nums" data-testid="analysis-forecast-day">
            {forecastPoint ? formatCurrency(forecastPoint.balance) : m.analysis_no_day_balance()}
          </p>
        </div>
        <p class="mt-4 text-xs leading-relaxed text-slate-400">
          {m.analysis_forecast_disclaimer()}
        </p>
      {:else}
        <p class="mt-3 text-sm text-slate-300">
          {groupFilter === "own" ? m.analysis_balance_missing() : m.analysis_balance_private()}
        </p>
        {#if groupFilter === "own"}<a
            href="/transactions?group=own"
            class="text-accent mt-2 inline-flex min-h-11 items-center text-sm"
            >{m.cockpit_set_opening()}</a
          >{/if}
      {/if}
    </section>
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
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <DayPicker
              label={m.analysis_balance_on_day()}
              value={selectedHistoryDate || overview.end}
              max={overview.end}
              onchange={(date) => (selectedHistoryDate = date)}
            />
            <p class="mt-2 text-xl font-semibold tabular-nums" data-testid="analysis-day-balance">
              {selectedPoint ? formatCurrency(selectedPoint.balance) : m.analysis_no_day_balance()}
            </p>
          </div>
          <div>
            <p class="text-sm text-slate-400">{m.analysis_balance_change()}</p>
            <p
              class="mt-2 text-xl font-semibold tabular-nums"
              data-testid="analysis-balance-change"
            >
              {balanceChange == null ? "—" : formatCurrency(balanceChange)}
            </p>
          </div>
        </div>
        {#if overview.chart.points.length > 1}
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
        {/if}
        <p class="mt-2 text-xs text-slate-400">{m.analysis_history_limit()}</p>
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
      period="custom"
      historyKind={overview.barKind === "day" ? "week" : "month"}
      historyOnly
      customRange={{ start: overview.start, end: overview.end }}
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
