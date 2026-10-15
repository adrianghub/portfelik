<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    analysisForecastEnd,
    buildAnalysisForecast,
    type ForecastHorizon,
  } from "$lib/analysis/forecast";
  import { analysisBalanceHelp } from "$lib/analysis/balance-help";
  import { buildAnalysisMonthDetail, monthKeyFromIso } from "$lib/analysis/month-detail";
  import { forecastTrough } from "$lib/services/forecast-trough";
  import BudgetCategoryHistory from "$lib/components/analysis/BudgetCategoryHistory.svelte";
  import CockpitForecastChart from "$lib/components/dashboard/CockpitForecastChart.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import {
    analysisWindow,
    analysisTransactionsUrl,
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
  import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
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
  import { cn, formatCurrency, formatDate } from "$lib/utils";
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
  const selectedCategoryIds = $derived(new Set($page.url.searchParams.getAll("category")));
  const grouping = $derived.by<"auto" | "day" | "week" | "month">(() => {
    const value = $page.url.searchParams.get("grouping");
    return value === "day" || value === "week" || value === "month" ? value : "auto";
  });
  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));
  const today = $derived(localDateIso());
  const forecastEnd = $derived(analysisForecastEnd(today, horizon));
  const forecastActive = $derived(mode === "forecast" && groupFilter === "own");
  const selectedMonthKey = $derived($page.url.searchParams.get("month"));
  const analysisReturnPath = $derived($page.url.pathname + $page.url.search);
  let selectedForecastDate = $state("");
  $effect(() => {
    void forecastEnd;
    selectedForecastDate = "";
  });

  function setSelectedMonth(monthKey: string | null) {
    const params = new URLSearchParams($page.url.searchParams);
    if (monthKey) params.set("month", monthKey);
    else params.delete("month");
    void goto(`/analysis?${params}`, { keepFocus: true, noScroll: true });
  }

  function txUrl(
    range: { start: string; end: string },
    status = "paid",
    categories: Iterable<string> = selectedCategoryIds
  ) {
    return analysisTransactionsUrl(range, groupFilter, categories, status, analysisReturnPath);
  }

  function forecastTxUrl(range: { start: string; end: string }) {
    return analysisTransactionsUrl(range, "own", [], "upcoming,overdue", analysisReturnPath);
  }

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

  const scopedFlows = $derived.by((): AnalysisFlow[] =>
    (ledgerQuery.data ?? [])
      .filter((row) => {
        const groupId = row.group_id ?? null;
        if (groupFilter === "all") return true;
        if (groupFilter === "own") return groupId === null;
        return groupId === groupFilter;
      })
      .filter((row) => isSupportedLedgerCurrency(row.currency))
      .map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        status: row.status,
        date: row.date.slice(0, 10),
        currency: row.currency,
        categoryId: row.category_id,
        categoryName: row.category_name,
      }))
  );

  const overview = $derived(
    buildAnalysisOverview({
      span,
      today,
      anchor,
      balanceScope: groupFilter === "own",
      rows: scopedFlows,
      customRange,
      categoryIds: selectedCategoryIds,
      grouping,
    })
  );

  const historyWindowKey = $derived(`${overview.start}:${overview.end}`);
  $effect(() => {
    if (mode === "history") {
      void historyWindowKey;
      selectedHistoryDate = "";
    }
  });

  const categoryChoices = $derived.by(() => {
    const choices = new Map<string, string>();
    for (const row of scopedFlows) {
      if (row.status !== "paid") continue;
      const date = row.date.slice(0, 10);
      if (date < overview.start || date > overview.end) continue;
      choices.set(row.categoryId || "none", row.categoryName?.trim() || m.analysis_uncategorized());
    }
    return [...choices]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  });
  function setCategory(id: string | null) {
    const ids = new Set(selectedCategoryIds);
    if (id == null) ids.clear();
    else if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    const params = new URLSearchParams($page.url.searchParams);
    params.delete("category");
    for (const value of ids) params.append("category", value);
    void goto(`/analysis?${params}`, { keepFocus: true, noScroll: true });
  }
  function setGrouping(next: string) {
    const params = new URLSearchParams($page.url.searchParams);
    if (next === "auto") params.delete("grouping");
    else params.set("grouping", next);
    void goto(`/analysis?${params}`, { keepFocus: true, noScroll: true });
  }

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
  const forecastMaxBar = $derived(
    Math.max(1, ...(forecast?.bars ?? []).flatMap((bar) => [bar.income, bar.expense]))
  );
  const historyMonthDetail = $derived.by(() => {
    if (!selectedMonthKey || !overview.chart?.points) return null;
    return buildAnalysisMonthDetail({
      monthKey: selectedMonthKey,
      points: overview.chart.points,
      flows: overview.flows,
    });
  });
  const forecastMonthDetail = $derived.by(() => {
    if (!selectedMonthKey || !forecast) return null;
    return buildAnalysisMonthDetail({
      monthKey: selectedMonthKey,
      points: forecast.points,
      flows: forecast.flows,
    });
  });
  const forecastLowest = $derived(forecast?.points ? forecastTrough(forecast.points) : null);
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
  const balanceChange = $derived(overview.balanceChange);

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

  function barLabel(key: string, rangeStart: string, rangeEnd: string): string {
    const label =
      key.length === 10 ? axisDayLabel(key) : axisDayLabel(`${key}-01`).replace(/^1 /, "");
    return rangeStart.slice(0, 4) !== rangeEnd.slice(0, 4) ? `${label} ${key.slice(0, 4)}` : label;
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
            min={forecast.start}
            max={forecastEnd}
            onchange={(date) => (selectedForecastDate = date)}
          />
          <p class="text-xl font-semibold tabular-nums" data-testid="analysis-forecast-day">
            {forecastPoint ? formatCurrency(forecastPoint.balance) : m.analysis_no_day_balance()}
          </p>
        </div>
        {#if forecast.bars.some((bar) => bar.income > 0 || bar.expense > 0)}
          <div
            class="mt-4 border-t border-white/5 pt-3"
            data-testid="analysis-forecast-bars"
            aria-label={m.analysis_forecast_flows_title()}
          >
            <h3 class="text-sm font-medium text-slate-300">{m.analysis_forecast_flows_title()}</h3>
            <div class="mt-2 flex gap-3 text-xs text-slate-400">
              <span class="flex items-center gap-1"
                ><span class="bg-positive h-2 w-2 rounded-sm" aria-hidden="true"
                ></span>{m.analysis_forecast_income()}</span
              ><span class="flex items-center gap-1"
                ><span class="bg-negative h-2 w-2 rounded-sm" aria-hidden="true"
                ></span>{m.analysis_forecast_expense()}</span
              >
            </div>
            <div class="mt-3 flex gap-1 overflow-x-auto pb-1">
              {#each forecast.bars as bar (bar.key)}
                <a
                  class="group focus-visible:ring-accent block min-w-2 flex-1 rounded focus-visible:ring-2 focus-visible:outline-none"
                  data-testid="analysis-forecast-bar-link"
                  href={forecastTxUrl(bar)}
                  aria-label={m.analysis_bar_details({
                    period: `${formatDate(bar.start)} – ${formatDate(bar.end)}`,
                    income: formatCurrency(bar.income),
                    expense: formatCurrency(bar.expense),
                  })}
                  title={m.analysis_bar_details({
                    period: `${formatDate(bar.start)} – ${formatDate(bar.end)}`,
                    income: formatCurrency(bar.income),
                    expense: formatCurrency(bar.expense),
                  })}
                  onclick={(event) => {
                    event.preventDefault();
                    setSelectedMonth(monthKeyFromIso(bar.start));
                  }}
                >
                  <div class="flex h-24 items-end justify-center gap-0.5 group-hover:bg-white/5">
                    <div
                      class="bg-positive w-1/3 rounded-sm"
                      style="height: {(bar.income / forecastMaxBar) * 100}%"
                    ></div>
                    <div
                      class="bg-negative w-1/3 rounded-sm"
                      style="height: {(bar.expense / forecastMaxBar) * 100}%"
                    ></div>
                  </div>
                </a>
              {/each}
            </div>
            <div class="mt-1 flex justify-between text-[11px] text-slate-400">
              <span
                >{barLabel(
                  forecast.bars[0].key,
                  forecast.bars[0].start,
                  forecast.bars.at(-1)!.end
                )}</span
              >{#if forecast.bars.length > 2}<span
                  >{barLabel(
                    forecast.bars[Math.floor(forecast.bars.length / 2)].key,
                    forecast.bars[0].start,
                    forecast.bars.at(-1)!.end
                  )}</span
                >{/if}<span
                >{barLabel(
                  forecast.bars.at(-1)!.key,
                  forecast.bars[0].start,
                  forecast.bars.at(-1)!.end
                )}</span
              >
            </div>
            <p class="mt-2 text-xs text-slate-500">{m.analysis_forecast_bar_hint()}</p>
          </div>
        {/if}
        {#if forecast.categories.length > 0}
          <section
            class="mt-4 border-t border-white/5 pt-3"
            aria-label={m.analysis_forecast_categories_title()}
            data-testid="analysis-forecast-categories"
          >
            <h3 class="text-sm font-medium text-slate-300">
              {m.analysis_forecast_categories_title()}
            </h3>
            <ul class="mt-3 space-y-2">
              {#each forecast.categories as category (category.id)}
                <li class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate text-slate-200">{categoryName(category.name)}</span>
                  <span class="shrink-0 text-slate-100 tabular-nums">
                    {formatCurrency(category.amount)}
                    <span class="text-xs text-slate-500">({category.share}%)</span>
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
        {#if forecastLowest}
          <p class="mt-3 text-sm text-slate-400" data-testid="analysis-forecast-lowest">
            {m.cockpit_lowest_balance_on({
              amount: formatCurrency(forecastLowest.balance),
              date: formatDate(forecastLowest.date),
            })}
          </p>
        {/if}
        {#if forecastMonthDetail}
          <section
            class="mt-4 rounded-xl border border-white/5 bg-slate-950/40 p-3"
            data-testid="analysis-forecast-month-detail"
            aria-label={m.analysis_month_detail_title()}
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-medium text-slate-200">
                {m.analysis_month_detail_title()} · {forecastMonthDetail.monthKey}
              </h3>
              <button
                type="button"
                class="text-xs text-slate-400 hover:text-slate-200"
                onclick={() => setSelectedMonth(null)}>{m.common_close()}</button
              >
            </div>
            <dl class="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-xs text-slate-400">{m.analysis_month_opening()}</dt>
                <dd class="text-slate-100 tabular-nums">
                  {forecastMonthDetail.opening == null
                    ? "—"
                    : formatCurrency(forecastMonthDetail.opening)}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-400">{m.analysis_month_closing()}</dt>
                <dd class="text-slate-100 tabular-nums">
                  {forecastMonthDetail.closing == null
                    ? "—"
                    : formatCurrency(forecastMonthDetail.closing)}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-400">{m.analysis_income()}</dt>
                <dd class="text-positive tabular-nums">
                  {formatCurrency(forecastMonthDetail.income)}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-400">{m.analysis_expense()}</dt>
                <dd class="text-rose-300 tabular-nums">
                  {formatCurrency(forecastMonthDetail.expense)}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-400">{m.analysis_month_net()}</dt>
                <dd class="text-slate-100 tabular-nums">
                  {formatCurrency(forecastMonthDetail.net)}
                </dd>
              </div>
              {#if forecastMonthDetail.lowest}
                <div>
                  <dt class="text-xs text-slate-400">{m.analysis_month_lowest()}</dt>
                  <dd class="text-slate-100 tabular-nums">
                    {formatCurrency(forecastMonthDetail.lowest.balance)}
                    <span class="text-xs text-slate-500"
                      >· {formatDate(forecastMonthDetail.lowest.date)}</span
                    >
                  </dd>
                </div>
              {/if}
            </dl>
            <a
              href={forecastTxUrl({
                start: forecastMonthDetail.start,
                end: forecastMonthDetail.end,
              })}
              class="text-accent mt-3 inline-flex min-h-11 items-center text-sm font-medium"
            >
              {m.dashboard_upcoming_see_all()}
            </a>
          </section>
        {/if}
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
              {balanceChange == null ? m.analysis_change_unknown() : formatCurrency(balanceChange)}
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
          {#if balanceSemantics === "end_of_day" && overview.chart.points.some((point) => point.kind === "confirmed")}
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

    <div class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5">
      <fieldset aria-label={m.analysis_category_filters()} data-testid="analysis-category-filters">
        <legend class="text-sm font-medium text-slate-300">{m.analysis_category_filters()}</legend>
        <div class="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          <button
            type="button"
            aria-pressed={selectedCategoryIds.size === 0}
            class={cn(
              "focus-visible:ring-accent min-h-11 rounded-full px-3 text-sm focus-visible:ring-2 focus-visible:outline-none",
              selectedCategoryIds.size === 0
                ? "bg-accent-gradient text-slate-900"
                : "bg-white/5 text-slate-300"
            )}
            onclick={() => setCategory(null)}>{m.analysis_all_categories()}</button
          >
          {#each categoryChoices as category (category.id)}
            <button
              type="button"
              aria-pressed={selectedCategoryIds.has(category.id)}
              class={cn(
                "focus-visible:ring-accent min-h-11 rounded-full px-3 text-sm focus-visible:ring-2 focus-visible:outline-none",
                selectedCategoryIds.has(category.id)
                  ? "bg-accent-gradient text-slate-900"
                  : "bg-white/5 text-slate-300"
              )}
              onclick={() => setCategory(category.id)}>{category.name}</button
            >
          {/each}
        </div>
      </fieldset>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label for="analysis-grouping" class="text-xs text-slate-400">{m.analysis_grouping()}</label
        >
        <select
          id="analysis-grouping"
          class="min-h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
          value={grouping}
          onchange={(event) => setGrouping(event.currentTarget.value)}
        >
          <option value="auto">{m.analysis_group_auto()}</option><option value="day"
            >{m.analysis_group_day()}</option
          ><option value="week">{m.analysis_group_week()}</option><option value="month"
            >{m.analysis_group_month()}</option
          >
        </select>
      </div>
      <p class="mt-2 text-xs text-slate-400">{m.analysis_category_balance_note()}</p>
    </div>
    {#if overview.categories.length > 0}
      <section
        class="rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-5"
        aria-label={m.analysis_categories_title()}
        data-testid="analysis-categories"
      >
        <h2 class="text-sm font-medium text-slate-300">{m.analysis_categories_title()}</h2>
        <ul class="mt-3 space-y-2">
          {#each overview.categories as category (category.id)}
            <li class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate text-slate-200">{categoryName(category.name)}</span>
              <span class="shrink-0 text-slate-100 tabular-nums">
                {formatCurrency(category.amount)}
                <span class="text-xs text-slate-500">({category.share}%)</span>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
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
            <p
              class="text-positive mt-1 text-xl font-semibold tabular-nums"
              data-testid="analysis-income"
            >
              {formatCurrency(overview.income)}
            </p>
          </div>
          <div>
            <p class="text-sm text-slate-400">{m.analysis_expense()}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums" data-testid="analysis-expense">
              {formatCurrency(overview.expense)}
            </p>
          </div>
        </div>
      {/if}
      {#if overview.previousAvailable}
        <div class="mt-3 border-t border-white/5 pt-3 text-xs text-slate-400">
          <p>{m.analysis_previous_period()}</p>
          <div class="mt-1 grid grid-cols-2 gap-3">
            <p>{m.analysis_income()}: {formatCurrency(overview.previousIncome)}</p>
            <p>{m.analysis_expense()}: {formatCurrency(overview.previousExpense)}</p>
          </div>
        </div>
      {:else}<p class="mt-3 text-xs text-slate-500">{m.analysis_no_previous_data()}</p>{/if}
      {#if overview.bars.some((bar) => bar.income > 0 || bar.expense > 0)}
        <div
          class="mt-4 border-t border-white/5 pt-3"
          aria-label={overview.barKind === "day"
            ? m.analysis_days_title()
            : overview.barKind === "week"
              ? m.analysis_weeks_title()
              : m.analysis_months_title()}
          data-testid="analysis-bars"
        >
          <h3 class="text-sm font-medium text-slate-300">
            {overview.barKind === "day"
              ? m.analysis_days_title()
              : overview.barKind === "week"
                ? m.analysis_weeks_title()
                : m.analysis_months_title()}
          </h3>
          <div class="mt-2 flex gap-3 text-xs text-slate-400">
            <span class="flex items-center gap-1"
              ><span class="bg-positive h-2 w-2 rounded-sm" aria-hidden="true"
              ></span>{m.analysis_income()}</span
            ><span class="flex items-center gap-1"
              ><span class="bg-negative h-2 w-2 rounded-sm" aria-hidden="true"
              ></span>{m.analysis_expense()}</span
            >
          </div>
          <div class="mt-3 flex gap-1 overflow-x-auto pb-1">
            {#each overview.bars as bar (bar.key)}
              <a
                class="group focus-visible:ring-accent block min-w-2 flex-1 rounded focus-visible:ring-2 focus-visible:outline-none"
                data-testid="analysis-bar-link"
                href={txUrl(bar)}
                aria-label={m.analysis_bar_details({
                  period: `${formatDate(bar.start)} – ${formatDate(bar.end)}`,
                  income: formatCurrency(bar.income),
                  expense: formatCurrency(bar.expense),
                })}
                title={m.analysis_bar_details({
                  period: `${formatDate(bar.start)} – ${formatDate(bar.end)}`,
                  income: formatCurrency(bar.income),
                  expense: formatCurrency(bar.expense),
                })}
                onclick={(event) => {
                  if (overview.barKind !== "month") return;
                  event.preventDefault();
                  setSelectedMonth(monthKeyFromIso(bar.start));
                }}
              >
                <div class="flex h-24 items-end justify-center gap-0.5 group-hover:bg-white/5">
                  <div
                    class="bg-positive w-1/3 rounded-sm"
                    style="height: {(bar.income / maxBar) * 100}%"
                  ></div>
                  <div
                    class="bg-negative w-1/3 rounded-sm"
                    style="height: {(bar.expense / maxBar) * 100}%"
                  ></div>
                </div>
              </a>
            {/each}
          </div>
          <div class="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>{barLabel(overview.bars[0].key, overview.start, overview.end)}</span
            >{#if overview.bars.length > 2}<span
                >{barLabel(
                  overview.bars[Math.floor(overview.bars.length / 2)].key,
                  overview.start,
                  overview.end
                )}</span
              >{/if}<span>{barLabel(overview.bars.at(-1)!.key, overview.start, overview.end)}</span>
          </div>
          <p class="mt-2 text-xs text-slate-500">{m.analysis_bar_hint()}</p>
        </div>
      {/if}
      {#if historyMonthDetail}
        <section
          class="mt-4 rounded-xl border border-white/5 bg-slate-950/40 p-3"
          data-testid="analysis-history-month-detail"
          aria-label={m.analysis_month_detail_title()}
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-slate-200">
              {m.analysis_month_detail_title()} · {historyMonthDetail.monthKey}
            </h3>
            <button
              type="button"
              class="text-xs text-slate-400 hover:text-slate-200"
              onclick={() => setSelectedMonth(null)}>{m.common_close()}</button
            >
          </div>
          <dl class="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt class="text-xs text-slate-400">{m.analysis_month_opening()}</dt>
              <dd class="text-slate-100 tabular-nums">
                {historyMonthDetail.opening == null
                  ? "—"
                  : formatCurrency(historyMonthDetail.opening)}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">{m.analysis_month_closing()}</dt>
              <dd class="text-slate-100 tabular-nums">
                {historyMonthDetail.closing == null
                  ? "—"
                  : formatCurrency(historyMonthDetail.closing)}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">{m.analysis_income()}</dt>
              <dd class="text-positive tabular-nums">
                {formatCurrency(historyMonthDetail.income)}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">{m.analysis_expense()}</dt>
              <dd class="text-rose-300 tabular-nums">
                {formatCurrency(historyMonthDetail.expense)}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">{m.analysis_month_net()}</dt>
              <dd class="text-slate-100 tabular-nums">{formatCurrency(historyMonthDetail.net)}</dd>
            </div>
            {#if historyMonthDetail.lowest}
              <div>
                <dt class="text-xs text-slate-400">{m.analysis_month_lowest()}</dt>
                <dd class="text-slate-100 tabular-nums">
                  {formatCurrency(historyMonthDetail.lowest.balance)}
                  <span class="text-xs text-slate-500"
                    >· {formatDate(historyMonthDetail.lowest.date)}</span
                  >
                </dd>
              </div>
            {/if}
          </dl>
          <a
            href={txUrl({ start: historyMonthDetail.start, end: historyMonthDetail.end })}
            class="text-accent mt-3 inline-flex min-h-11 items-center text-sm font-medium"
          >
            {m.dashboard_upcoming_see_all()}
          </a>
        </section>
      {/if}
    </section>

    <BudgetCategoryHistory
      {groupFilter}
      {selectedCategoryIds}
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
