<script lang="ts">
  import { goto } from "$app/navigation";
  import DashboardSpendingInsight from "$lib/components/dashboard/DashboardSpendingInsight.svelte";
  import SpendHistoryChart from "$lib/components/dashboard/charts/LazySpendHistoryChart.svelte";
  import GlossarySheet from "$lib/components/ui/GlossarySheet.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import { session } from "$lib/auth/session.svelte";
  import {
    calendarMonthFromIso,
    calendarMonthLabel,
    inclusiveDayRangeLabel,
  } from "$lib/cockpit/month-window";
  import * as m from "$lib/paraglide/messages";
  import { qk } from "$lib/query-keys";
  import { fetchCategories } from "$lib/services/categories";
  import {
    computeGoalSpendingSplit,
    partitionForecastExpenses,
    partitionLedgerExpenses,
    resolveCeleCategoryId,
  } from "$lib/services/goal-spending";
  import { fetchSaveLinkedTransactionIds } from "$lib/services/plan-settlement";
  import { fetchRecurringOccurrenceSkips } from "$lib/services/recurring-occurrences";
  import {
    buildDayWindows,
    buildForwardDayWindows,
    buildForwardPeriodWindows,
    buildPeriodWindows,
    bucketPeriodHistory,
  } from "$lib/services/period-history";
  import { fetchRecurringTemplates, fetchTransactions } from "$lib/services/transactions";
  import { computeSpendingInsight } from "$lib/services/spending-insight";
  import { forecastTransactions, ledgerTransactions } from "$lib/services/transaction-cashflow";
  import {
    forwardForecastTransactions,
    recurringProjectionsForTransactionRange,
  } from "$lib/services/transaction-projections";
  import type { TransactionWithCategory } from "$lib/types";
  import { getDateRangeBounds } from "$lib/utils";
  import type { DashboardPeriod, DashboardRange, ScopeFilter } from "$lib/utils/list-view-url";
  import { createQuery } from "@tanstack/svelte-query";

  let {
    groupFilter,
    period,
    historyKind,
    customRange = null,
    historyOnly = false,
  }: {
    groupFilter: ScopeFilter;
    period: DashboardPeriod;
    /** Grain of the spend-history bars. Independent of a long category window. */
    historyKind: "week" | "month" | "year";
    customRange?: DashboardRange | null;
    historyOnly?: boolean;
  } = $props();

  let spendingExpanded = $state(false);
  let glossaryOpen = $state(false);
  let glossaryFocusId = $state<string | undefined>(undefined);

  function toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function windowLengthDays(start: string, endExclusive: string): number {
    const dayMs = 86_400_000;
    const s = new Date(start.slice(0, 10)).getTime();
    const e = new Date(endExclusive.slice(0, 10)).getTime();
    return Math.max(1, Math.round((e - s) / dayMs));
  }

  function dateOnly(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  function previousDateOnly(value: string): string {
    const d = new Date(value);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  const bounds = $derived.by(() => {
    const now = new Date();
    if (period === "custom" && customRange) {
      const endEx = new Date(customRange.end);
      endEx.setDate(endEx.getDate() + 1);
      const end = toIsoDate(endEx);
      return {
        start: customRange.start,
        end,
        buckets: windowLengthDays(customRange.start, end),
      };
    }
    if (period === "week" || period === "custom") {
      const end = new Date(now);
      end.setDate(end.getDate() + 1);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { start: toIsoDate(start), end: toIsoDate(end), buckets: 7 };
    }
    if (period === "year") {
      const y = now.getFullYear();
      const range = getDateRangeBounds(y, 1, y, 12);
      return { start: range.start, end: range.end, buckets: 12 };
    }
    const range = getDateRangeBounds(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getFullYear(),
      now.getMonth() + 1
    );
    return {
      start: range.start,
      end: range.end,
      buckets: windowLengthDays(range.start, range.end),
    };
  });

  const prevBounds = $derived.by(() => {
    if (period === "year") {
      const now = new Date();
      const y = now.getFullYear();
      const start = getDateRangeBounds(y - 1, 1, y - 1, 12).start;
      const end = new Date(y - 1, now.getMonth(), now.getDate() + 1);
      return { start, end: toIsoDate(end) };
    }
    if (period === "month") {
      const now = new Date();
      const previousMonth = new Date(now);
      previousMonth.setDate(1);
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      const fullPreviousMonth = getDateRangeBounds(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + 1,
        previousMonth.getFullYear(),
        previousMonth.getMonth() + 1
      );
      const lastDay = new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + 1,
        0
      ).getDate();
      const comparedThrough = new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth(),
        Math.min(now.getDate(), lastDay) + 1
      );
      return { start: fullPreviousMonth.start, end: toIsoDate(comparedThrough) };
    }
    const start = new Date(bounds.start);
    start.setDate(start.getDate() - bounds.buckets);
    return { start: toIsoDate(start), end: bounds.start };
  });

  const ROLLING_PERIODS = 3;
  const rollingBounds = $derived.by(() => {
    if (period === "year") {
      const y = new Date().getFullYear();
      return getDateRangeBounds(y - ROLLING_PERIODS, 1, y - 1, 12);
    }
    if (period === "month") {
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - ROLLING_PERIODS);
      return { start: toIsoDate(start), end: bounds.start };
    }
    const start = new Date(bounds.start);
    start.setDate(start.getDate() - bounds.buckets * ROLLING_PERIODS);
    return { start: toIsoDate(start), end: bounds.start };
  });

  const HISTORY_PERIODS = 6;
  const historyWindows = $derived(
    historyKind === "week"
      ? buildDayWindows(7, HISTORY_PERIODS, bounds.end)
      : buildPeriodWindows(historyKind, HISTORY_PERIODS)
  );
  const forwardWindows = $derived(
    historyOnly
      ? []
      : historyKind === "year"
        ? buildForwardPeriodWindows("year", 1)
        : historyKind === "month"
          ? buildForwardPeriodWindows("month", 3)
          : buildForwardDayWindows(7, 3, bounds.end)
  );
  const forwardBounds = $derived(
    forwardWindows.length > 0
      ? {
          start: forwardWindows[0].start,
          end: forwardWindows[forwardWindows.length - 1].end,
        }
      : { start: bounds.end, end: bounds.end }
  );
  const spanBounds = $derived.by(() => {
    const historyStart = historyWindows[0].start;
    const rollingStart = rollingBounds.start;
    const start =
      new Date(historyStart).getTime() < new Date(rollingStart).getTime()
        ? historyStart
        : rollingStart;
    return { start, end: forwardBounds.end };
  });

  const txQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "budget-analysis",
      spanBounds.start,
      spanBounds.end,
      period
    ),
    queryFn: () => fetchTransactions(spanBounds.start, spanBounds.end),
    enabled: !!session.userId,
    staleTime: 60_000,
  }));
  const categoriesQuery = createQuery(() => ({
    queryKey: qk.categories(session.userId!),
    queryFn: fetchCategories,
    enabled: !!session.userId,
  }));
  const saveLinkedQuery = createQuery(() => ({
    queryKey: qk.saveLinkedIds(session.userId!),
    queryFn: fetchSaveLinkedTransactionIds,
    enabled: !!session.userId,
  }));
  const recurringTemplatesQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "recurring-templates"),
    queryFn: fetchRecurringTemplates,
    enabled: !!session.userId,
    staleTime: 60_000,
  }));
  const recurringSkipsQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "budget-analysis-skips",
      bounds.start,
      forwardBounds.end
    ),
    queryFn: () => fetchRecurringOccurrenceSkips(bounds.start, forwardBounds.end),
    enabled: !!session.userId,
    staleTime: 60_000,
  }));

  function scopeFilter(list: TransactionWithCategory[]) {
    return list.filter(
      (tx) =>
        groupFilter === "all" ||
        (groupFilter === "own" ? tx.group_id === null : tx.group_id === groupFilter)
    );
  }

  function inWindow(list: TransactionWithCategory[], start: string, end: string) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return list.filter((tx) => {
      const ts = new Date(tx.date).getTime();
      return ts >= startMs && ts < endMs;
    });
  }

  const allScopedTxs = $derived(scopeFilter(txQuery.data ?? []));
  const scopedTxs = $derived(inWindow(allScopedTxs, bounds.start, bounds.end));
  const saveLinkedIds = $derived(saveLinkedQuery.data ?? new Set<string>());
  const celeCategoryId = $derived(resolveCeleCategoryId(categoriesQuery.data ?? []));
  const spendingInsight = $derived(
    computeSpendingInsight({
      current: ledgerTransactions(scopedTxs),
      previous: ledgerTransactions(inWindow(allScopedTxs, prevBounds.start, prevBounds.end)),
      rolling: ledgerTransactions(inWindow(allScopedTxs, rollingBounds.start, rollingBounds.end)),
      periodsInRolling: ROLLING_PERIODS,
      budgets: [],
      saveLinkedIds,
      celeCategoryId,
    })
  );
  const goalSpendingSplit = $derived(
    computeGoalSpendingSplit(ledgerTransactions(scopedTxs), saveLinkedIds, celeCategoryId)
  );
  const chartParts = $derived(partitionLedgerExpenses(allScopedTxs, saveLinkedIds, celeCategoryId));
  const historyBuckets = $derived(bucketPeriodHistory(chartParts.consumption, historyWindows));
  const forwardForecastTxs = $derived.by(() => {
    if (forwardWindows.length === 0) return [];
    return forwardForecastTransactions({
      templates: scopeFilter(recurringTemplatesQuery.data ?? []),
      existing: inWindow(allScopedTxs, forwardBounds.start, forwardBounds.end),
      skipped: recurringSkipsQuery.data ?? [],
      start: forwardWindows[0].start,
      end: forwardWindows[forwardWindows.length - 1].end,
    });
  });
  const currentProjectedTxs = $derived(
    recurringProjectionsForTransactionRange({
      templates: scopeFilter(recurringTemplatesQuery.data ?? []),
      existing: allScopedTxs,
      skipped: recurringSkipsQuery.data ?? [],
      start: bounds.start,
      end: bounds.end,
    })
  );
  const forwardBuckets = $derived(
    bucketPeriodHistory(
      partitionForecastExpenses(forwardForecastTxs, saveLinkedIds, celeCategoryId).consumption,
      forwardWindows
    ).map((bucket) => ({ ...bucket, isProjected: true }))
  );
  const currentForecastBucket = $derived.by(() => {
    const paidBucket = historyBuckets[historyBuckets.length - 1];
    if (!paidBucket.isCurrent) return paidBucket;
    const window = historyWindows[historyWindows.length - 1];
    const [bucket] = bucketPeriodHistory(
      partitionForecastExpenses(
        [...forecastTransactions(scopedTxs), ...currentProjectedTxs],
        saveLinkedIds,
        celeCategoryId
      ).consumption,
      [window]
    );
    return { ...bucket, isProjected: bucket.total - paidBucket.total > 0.005 };
  });
  const allocationByLabel = $derived.by(() => {
    const historical = bucketPeriodHistory(chartParts.allocation, historyWindows);
    const totals = new Map(historical.map((bucket) => [bucket.label, bucket.total]));
    const currentWindow = historyWindows[historyWindows.length - 1];
    const currentBucket = historical[historical.length - 1];
    if (currentBucket?.isCurrent) {
      const [forecastAllocation] = bucketPeriodHistory(
        partitionForecastExpenses(
          [...forecastTransactions(scopedTxs), ...currentProjectedTxs],
          saveLinkedIds,
          celeCategoryId
        ).allocation,
        [currentWindow]
      );
      totals.set(forecastAllocation.label, forecastAllocation.total);
    }
    const forwardAllocations = bucketPeriodHistory(
      partitionForecastExpenses(forwardForecastTxs, saveLinkedIds, celeCategoryId).allocation,
      forwardWindows
    );
    for (const bucket of forwardAllocations) totals.set(bucket.label, bucket.total);
    return totals;
  });
  const combinedHistoryBuckets = $derived([
    ...historyBuckets.slice(0, -1),
    currentForecastBucket,
    ...forwardBuckets,
  ]);
  const categoryIdsByName = $derived(
    new Map(
      (categoriesQuery.data ?? [])
        .filter((category) => category.type === "expense")
        .map((category) => [category.name, category.id])
    )
  );
  const categoryColors = $derived(
    new Map(
      (categoriesQuery.data ?? [])
        .filter((category) => !!category.color)
        .map((category) => [category.id, category.color!])
    )
  );
  const categoryPeriodLabel = $derived.by(() => {
    if (period === "week") return m.dashboard_period_week();
    if (period === "year") return bounds.start.slice(0, 4);
    if (period === "custom" && customRange) {
      return inclusiveDayRangeLabel(customRange.start, customRange.end);
    }
    return calendarMonthLabel(calendarMonthFromIso(bounds.start));
  });
  const historySpanLabel = $derived(
    historyKind === "week"
      ? m.cockpit_history_span_week()
      : historyKind === "year"
        ? m.cockpit_history_span_year()
        : m.cockpit_history_span_month()
  );
  function selectHistoryPeriod(bucket: { start: string; end: string; isProjected?: boolean }) {
    const params = new URLSearchParams();
    params.set("startDate", dateOnly(bucket.start));
    params.set("endDate", previousDateOnly(bucket.end));
    params.set("group", groupFilter);
    params.set("type", "expense");
    if (bucket.isProjected) params.set("status", "upcoming,overdue");
    goto(`/transactions?${params.toString()}`);
  }

  function categoryHref(categoryId: string | null): string {
    const params = new URLSearchParams();
    params.set("startDate", bounds.start.slice(0, 10));
    params.set("endDate", previousDateOnly(bounds.end));
    params.set("group", groupFilter);
    if (categoryId) params.set("categoryId", categoryId);
    return `/transactions?${params.toString()}`;
  }
</script>

{#if txQuery.isLoading}
  <div class="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
    <div class="h-40 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
    <div class="h-64 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  </div>
{:else if txQuery.isError}
  <QueryError error={txQuery.error} onRetry={() => txQuery.refetch()} />
{:else}
  <div class="grid min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
    <DashboardSpendingInsight
      insight={spendingInsight}
      {period}
      periodLabel={categoryPeriodLabel}
      goalSplit={goalSpendingSplit}
      bind:expanded={spendingExpanded}
      {categoryHref}
    />
    <SpendHistoryChart
      buckets={combinedHistoryBuckets}
      {allocationByLabel}
      {categoryIdsByName}
      {categoryColors}
      onselectperiod={selectHistoryPeriod}
      onOpenGlossary={(entryId) => {
        glossaryFocusId = entryId;
        glossaryOpen = true;
      }}
      periodLabel={historySpanLabel}
    />
  </div>
{/if}

<GlossarySheet
  open={glossaryOpen}
  focusEntryId={glossaryFocusId}
  source="tooltip"
  onclose={() => {
    glossaryOpen = false;
    glossaryFocusId = undefined;
  }}
/>
