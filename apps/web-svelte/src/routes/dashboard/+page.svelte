<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import DashboardImportHealth from "$lib/components/dashboard/DashboardImportHealth.svelte";
  import DashboardActions from "$lib/components/dashboard/DashboardActions.svelte";
  import DashboardNetWorthStrip from "$lib/components/dashboard/DashboardNetWorthStrip.svelte";
  import DashboardPlanProgress from "$lib/components/dashboard/DashboardPlanProgress.svelte";
  import DashboardBalanceHero from "$lib/components/dashboard/DashboardBalanceHero.svelte";
  import DashboardSpendingInsight from "$lib/components/dashboard/DashboardSpendingInsight.svelte";
  import DashboardViewToolbar from "$lib/components/dashboard/DashboardViewToolbar.svelte";
  import SpendHistoryChart from "$lib/components/dashboard/charts/SpendHistoryChart.svelte";
  import * as m from "$lib/paraglide/messages";
  import DemoShowcaseBanner from "$lib/components/onboarding/DemoShowcaseBanner.svelte";
  import GlossarySheet from "$lib/components/ui/GlossarySheet.svelte";
  import { track } from "$lib/analytics";
  import { clearDemoData, fetchDemoProbe, hasDemoData } from "$lib/services/demo-data";
  import { resetGuidedTourForReplay } from "$lib/services/guided-tour-actions";
  import { fetchPlans } from "$lib/services/plans";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchMyGroupRoles, fetchUserGroups } from "$lib/services/groups";
  import {
    computeForecastSummary,
    computeLedgerSummary,
    forecastTransactions,
    ledgerTransactions,
  } from "$lib/services/transaction-cashflow";
  import {
    fetchRecurringTemplates,
    fetchTransactions,
    updateTransactionsStatus,
  } from "$lib/services/transactions";
  import { buildRecurringSeriesList } from "$lib/services/recurring-series";
  import { computeSpendingInsight } from "$lib/services/spending-insight";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchSaveLinkedTransactionIds } from "$lib/services/plan-settlement";
  import {
    computeGoalSpendingSplit,
    partitionLedgerExpenses,
    resolveCeleCategoryId,
  } from "$lib/services/goal-spending";
  import { fetchRecurringOccurrenceSkips } from "$lib/services/recurring-occurrences";
  import {
    forwardForecastTransactions,
    recurringProjectionsForTransactionRange,
  } from "$lib/services/transaction-projections";
  import {
    buildPeriodWindows,
    buildForwardPeriodWindows,
    buildDayWindows,
    buildForwardDayWindows,
    bucketPeriodHistory,
  } from "$lib/services/period-history";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import type { TransactionStatus, TransactionWithCategory } from "$lib/types";
  import { cn, getDateRangeBounds } from "$lib/utils";
  import { syncListViewUrl } from "$lib/utils/navigation";
  import {
    parseDashboardPeriod,
    parseDashboardRange,
    parseScopeFilter,
    type DashboardPeriod,
    type ScopeFilter,
  } from "$lib/utils/list-view-url";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";
  import { ChevronDown } from "lucide-svelte";
  import { dailyGreeting } from "$lib/dashboard-daily";

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let historyExpanded = $state(untrack(() => isDesktop.current));
  let balanceExpanded = $state(false);
  let spendingExpanded = $state(false);

  const greeting = dailyGreeting();

  type Period = DashboardPeriod;
  const period = $derived(parseDashboardPeriod($page.url.searchParams));
  const customRange = $derived(parseDashboardRange($page.url.searchParams));
  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));

  function setPeriod(next: Period) {
    syncListViewUrl("/dashboard", $page.url.searchParams, { period: next });
  }

  function setCustomRange(start: string, end: string) {
    syncListViewUrl("/dashboard", $page.url.searchParams, { range: { start, end } });
  }

  function setGroupFilter(scope: ScopeFilter) {
    syncListViewUrl("/dashboard", $page.url.searchParams, { group: scope });
  }

  function toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function transactionsHref(extra: Record<string, string> = {}): string {
    const params = new URLSearchParams();

    if (period === "year") {
      const year = new Date().getFullYear();
      params.set("startYear", String(year));
      params.set("startMonth", "1");
      params.set("endYear", String(year));
      params.set("endMonth", "12");
    } else {
      // week/month/custom are day windows; mirror the exact bounds so the
      // transactions list shows the same rows the dashboard aggregated.
      params.set("startDate", bounds.start.slice(0, 10));
      params.set("endDate", previousDateOnly(bounds.end));
    }

    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
    return `/transactions?${params.toString()}`;
  }

  /** Drill from a spend-history bar into that exact window's transactions. */
  function dateOnly(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  function previousDateOnly(value: string): string {
    const d = new Date(value);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function selectHistoryPeriod(bucket: {
    start: string;
    end: string;
    isProjected?: boolean;
  }): void {
    // bucket.end is exclusive; the transactions range wants an inclusive last day.
    const params = new URLSearchParams();
    params.set("startDate", dateOnly(bucket.start));
    params.set("endDate", previousDateOnly(bucket.end));
    params.set("group", groupFilter);
    params.set("type", "expense");
    if (bucket.isProjected) {
      params.set("status", "upcoming,overdue");
    }
    goto(`/transactions?${params.toString()}`);
  }

  const queryClient = useQueryClient();

  const groupRolesQuery = createQuery(() => ({
    queryKey: qk.myGroupRoles(session.userId!),
    queryFn: fetchMyGroupRoles,
    enabled: () => !!session.userId,
  }));

  function dashCanManage(tx: TransactionWithCategory): boolean {
    if (!session.userId) return false;
    return canManageTransaction(tx, session.userId, groupRolesQuery.data ?? new Map());
  }

  // Settling can flip a plan-linked transaction to paid, so plan progress must refresh too.
  async function invalidateAfterSettle() {
    const u = requireSessionUserId();
    await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
    await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
    await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
  }

  const settleMutation = createMutation(() => ({
    mutationFn: (vars: { id: string; prev: TransactionStatus }) =>
      updateTransactionsStatus([vars.id], "paid"),
    onSuccess: async (_data, vars) => {
      await invalidateAfterSettle();
      toast.success(m.toast_transaction_settled(), {
        action: {
          label: m.toast_transaction_settle_undo(),
          onClick: () => {
            void updateTransactionsStatus([vars.id], vars.prev)
              .then(() => invalidateAfterSettle())
              .catch((err) => toastError(err));
          },
        },
      });
    },
    onError: (err) => toastError(err),
  }));

  function quickSettle(tx: TransactionWithCategory) {
    settleMutation.mutate({ id: tx.id, prev: tx.status });
  }

  const profileQuery = createQuery(() => ({
    queryKey: qk.profile(session.userId!),
    queryFn: () => fetchProfile(session.userId!),
    enabled: () => !!session.userId,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: qk.plans(session.userId!),
    queryFn: fetchPlans,
    enabled: () => !!session.userId,
  }));

  const demoProbeQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "demo-probe"),
    queryFn: fetchDemoProbe,
    enabled: () => !!session.userId,
    staleTime: 60_000,
  }));

  const demoActive = $derived(
    hasDemoData({
      transactions: demoProbeQuery.data?.transactions ?? [],
      plans: plansQuery.data ?? [],
      netWorthItems: demoProbeQuery.data?.netWorthItems ?? [],
    })
  );

  let glossaryOpen = $state(false);
  let glossaryFocusId = $state<string | undefined>(undefined);

  function openGlossary(entryId: string) {
    glossaryFocusId = entryId;
    glossaryOpen = true;
  }

  const clearDemoMutation = createMutation(() => ({
    mutationFn: clearDemoData,
    onSuccess: async (result) => {
      const u = requireSessionUserId();
      track("demo_cleared", { row_count: result.deleted });
      await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
      await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "demo-probe") });
      await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "count-probe") });
      toast.success(m.demo_cleared_toast());
    },
    onError: (err) => toastError(err),
  }));

  const restartTourMutation = createMutation(() => ({
    mutationFn: async () => {
      const profile = profileQuery.data;
      const u = session.userId;
      if (!u || !profile) throw new Error("no_profile");
      await resetGuidedTourForReplay(queryClient, u, profile);
    },
    onSuccess: () => {
      toast.success(m.tour_restarted_toast());
    },
    onError: (err) => toastError(err),
  }));

  /** Days in [start, end) for date-only ISO strings. */
  function windowLengthDays(start: string, endExclusive: string): number {
    const dayMs = 86_400_000;
    const s = new Date(start.slice(0, 10)).getTime();
    const e = new Date(endExclusive.slice(0, 10)).getTime();
    return Math.max(1, Math.round((e - s) / dayMs));
  }

  // week/month are rolling day windows ending today ("last 7/30 days"), not
  // calendar periods — a calendar month viewed on the 2nd tells the user
  // nothing. custom is the picker's inclusive range. year stays calendar.
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
      const b = getDateRangeBounds(y, 1, y, 12);
      return { start: b.start, end: b.end, buckets: 12 };
    }
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { start: toIsoDate(start), end: toIsoDate(end), buckets: 30 };
  });

  const groupsQuery = createQuery(() => ({
    queryKey: qk.userGroups(session.userId!),
    queryFn: fetchUserGroups,
    enabled: () => !!session.userId,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: qk.categories(session.userId!),
    queryFn: fetchCategories,
    enabled: () => !!session.userId,
  }));

  const saveLinkedQuery = createQuery(() => ({
    queryKey: qk.saveLinkedIds(session.userId!),
    queryFn: fetchSaveLinkedTransactionIds,
    enabled: () => !!session.userId,
  }));

  // Previous window: day windows (week/month/custom) are always complete, so
  // the comparison is simply the contiguous window of the same length before
  // this one. Year is still a partial calendar period, so it compares
  // year-to-date against the same elapsed span of the previous year.
  const prevBounds = $derived.by(() => {
    if (period === "year") {
      const now = new Date();
      const y = now.getFullYear();
      const start = getDateRangeBounds(y - 1, 1, y - 1, 12).start;
      // Same elapsed day-of-year in the previous year, end-exclusive.
      const end = new Date(y - 1, now.getMonth(), now.getDate() + 1);
      return { start, end: toIsoDate(end) };
    }
    const start = new Date(bounds.start);
    start.setDate(start.getDate() - bounds.buckets);
    return { start: toIsoDate(start), end: bounds.start };
  });

  // Rolling window: last 3 complete windows before the current one (for averages).
  const ROLLING_PERIODS = 3;
  const rollingBounds = $derived.by(() => {
    if (period === "year") {
      const y = new Date().getFullYear();
      return getDateRangeBounds(y - ROLLING_PERIODS, 1, y - 1, 12);
    }
    const start = new Date(bounds.start);
    start.setDate(start.getDate() - bounds.buckets * ROLLING_PERIODS);
    return { start: toIsoDate(start), end: bounds.start };
  });

  // Multi-period comparison history: last 6 windows of the selected length,
  // anchored to the current window's end (today for week/month, the picked
  // end for custom).
  const HISTORY_PERIODS = 6;
  const historyWindows = $derived(
    period === "year"
      ? buildPeriodWindows("year", HISTORY_PERIODS)
      : buildDayWindows(bounds.buckets, HISTORY_PERIODS, bounds.end)
  );

  // Recurring-template projection: forecast periods appended as isProjected buckets.
  // Year is clamped — projecting recurring rows three calendar years out is noise.
  // Custom ranges get no forecast: they are a backward-looking analysis window.
  const forwardWindows = $derived.by(() => {
    if (period === "custom") return [];
    if (period === "year") return buildForwardPeriodWindows("year", 1);
    return buildForwardDayWindows(bounds.buckets, 3, bounds.end);
  });
  const forwardBounds = $derived(
    forwardWindows.length > 0
      ? {
          start: forwardWindows[0].start,
          end: forwardWindows[forwardWindows.length - 1].end,
        }
      : { start: bounds.end, end: bounds.end }
  );

  // One spanning fetch [history ∪ 90-day overdue lookback … forecast horizon);
  // every dashboard window below is a client-side slice of it. Replaces five
  // overlapping per-window fetches of the same rows.
  const OVERDUE_LOOKBACK_DAYS = 90;
  // The upcoming table keeps looking ahead of today even when the analysis
  // window is a past custom range with no forecast buckets.
  const UPCOMING_AHEAD_DAYS = 30;
  const spanBounds = $derived.by(() => {
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - OVERDUE_LOOKBACK_DAYS);
    const lookbackStart = toIsoDate(lookback);
    const historyStart = historyWindows[0].start;
    const start =
      new Date(historyStart).getTime() < new Date(lookbackStart).getTime()
        ? historyStart
        : lookbackStart;
    const ahead = new Date();
    ahead.setDate(ahead.getDate() + UPCOMING_AHEAD_DAYS);
    const minEnd = toIsoDate(ahead);
    const end =
      new Date(forwardBounds.end).getTime() > new Date(minEnd).getTime()
        ? forwardBounds.end
        : minEnd;
    return { start, end };
  });

  const txQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "dashboard-span",
      spanBounds.start,
      spanBounds.end
    ),
    queryFn: () => fetchTransactions(spanBounds.start, spanBounds.end),
    enabled: () => !!session.userId,
    staleTime: 60_000,
  }));

  function scopeFilter(list: TransactionWithCategory[]) {
    return list.filter(
      (tx) =>
        groupFilter === "all" ||
        (groupFilter === "own" ? tx.group_id === null : tx.group_id === groupFilter)
    );
  }

  /** Rows with `date` inside [start, end); bounds may be date-only or full ISO strings. */
  function inWindow(
    list: TransactionWithCategory[],
    start: string,
    end: string
  ): TransactionWithCategory[] {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return list.filter((tx) => {
      const ts = new Date(tx.date).getTime();
      return ts >= startMs && ts < endMs;
    });
  }

  const allScopedTxs = $derived(scopeFilter(txQuery.data ?? []));
  const scopedTxs = $derived(inWindow(allScopedTxs, bounds.start, bounds.end));
  const scopedLedgerTxs = $derived(ledgerTransactions(scopedTxs));

  const summary = $derived(
    scopedTxs.length > 0 || txQuery.data ? computeLedgerSummary(scopedTxs) : null
  );

  const previousLedgerTxs = $derived(
    ledgerTransactions(inWindow(allScopedTxs, prevBounds.start, prevBounds.end))
  );
  const rollingLedgerTxs = $derived(
    ledgerTransactions(inWindow(allScopedTxs, rollingBounds.start, rollingBounds.end))
  );

  const saveLinkedIds = $derived(saveLinkedQuery.data ?? new Set<string>());
  const celeCategoryId = $derived(resolveCeleCategoryId(categoriesQuery.data ?? []));

  const spendingInsight = $derived(
    computeSpendingInsight({
      current: scopedLedgerTxs,
      previous: previousLedgerTxs,
      rolling: rollingLedgerTxs,
      periodsInRolling: ROLLING_PERIODS,
      budgets: [],
      saveLinkedIds,
      celeCategoryId,
    })
  );

  const goalSpendingSplit = $derived(
    computeGoalSpendingSplit(scopedLedgerTxs, saveLinkedIds, celeCategoryId)
  );

  const chartConsumptionTxs = $derived(
    partitionLedgerExpenses(allScopedTxs, saveLinkedIds, celeCategoryId).consumption
  );
  const chartAllocationTxs = $derived(
    partitionLedgerExpenses(allScopedTxs, saveLinkedIds, celeCategoryId).allocation
  );

  const historyBuckets = $derived(bucketPeriodHistory(chartConsumptionTxs, historyWindows));

  const allocationByLabel = $derived.by(() => {
    const hist = bucketPeriodHistory(chartAllocationTxs, historyWindows);
    const fwd =
      forwardWindows.length > 0 ? bucketPeriodHistory(chartAllocationTxs, forwardWindows) : [];
    return new Map([...hist, ...fwd].map((b) => [b.label, b.total]));
  });

  const recurringTemplatesQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "recurring-templates"),
    queryFn: fetchRecurringTemplates,
    enabled: () => !!session.userId,
    staleTime: 60_000,
  }));
  // Skips span current period + forecast horizon: projections are built for
  // both windows below.
  const recurringSkipsQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "dashboard-recurring-skips",
      bounds.start,
      forwardBounds.end
    ),
    queryFn: () => fetchRecurringOccurrenceSkips(bounds.start, forwardBounds.end),
    enabled: () => !!session.userId,
    staleTime: 60_000,
  }));
  // Forecast source = scheduled real rows (one-off upcoming + materialized
  // recurring occurrences) UNIONed with deduped projections — so the chart's
  // forecast region agrees with the /transactions upcoming list for a window,
  // instead of under-reporting by showing recurring projections only.
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
  const forwardBuckets = $derived(
    bucketPeriodHistory(
      partitionLedgerExpenses(forwardForecastTxs, saveLinkedIds, celeCategoryId).consumption,
      forwardWindows
    ).map((b) => ({
      ...b,
      isProjected: true,
    }))
  );

  // Read-time projections inside the current period (now → period end). Same
  // primitive /transactions uses, so "Z zaplanowanymi", the chart's current bar,
  // and the upcoming list all agree with the transactions list for the window.
  const currentProjectedTxs = $derived(
    recurringProjectionsForTransactionRange({
      templates: scopeFilter(recurringTemplatesQuery.data ?? []),
      existing: allScopedTxs,
      skipped: recurringSkipsQuery.data ?? [],
      start: bounds.start,
      end: bounds.end,
    })
  );

  const forecastSummary = $derived(
    scopedTxs.length > 0 || txQuery.data
      ? computeForecastSummary([...scopedTxs, ...currentProjectedTxs])
      : null
  );
  const showForecastNote = $derived(
    !!summary &&
      !!forecastSummary &&
      (summary.net !== forecastSummary.net ||
        summary.total_income !== forecastSummary.total_income ||
        summary.total_expenses !== forecastSummary.total_expenses)
  );

  // Current bucket: paid so far + scheduled/projected remainder — the bar shows
  // the expected end-of-period spend and joins the forecast band via isProjected.
  const currentForecastBucket = $derived.by(() => {
    const paidBucket = historyBuckets[historyBuckets.length - 1];
    // A custom range that ends in the past has nothing left to forecast — its
    // last bucket is plain history.
    if (!paidBucket.isCurrent) return paidBucket;
    const window = historyWindows[historyWindows.length - 1];
    const [bucket] = bucketPeriodHistory(
      partitionLedgerExpenses(
        [...forecastTransactions(scopedTxs), ...currentProjectedTxs],
        saveLinkedIds,
        celeCategoryId
      ).consumption,
      [window]
    );
    return { ...bucket, isProjected: bucket.total - paidBucket.total > 0.005 };
  });
  const combinedHistoryBuckets = $derived([
    ...historyBuckets.slice(0, -1),
    currentForecastBucket,
    ...forwardBuckets,
  ]);

  // Only meaningful once period income is real: a tiny income row (interest, a
  // refund) makes net/income explode into ±1000s of %. Clamped to ±100 — beyond
  // that the number stops communicating anything the red balance doesn't.
  const SAVINGS_RATIO_MIN_INCOME = 150;
  const savingsRatio = $derived.by(() => {
    if (!summary) return null;
    if (summary.total_income < SAVINGS_RATIO_MIN_INCOME) return null;
    const pct = Math.round((summary.net / summary.total_income) * 100);
    return Math.max(-100, Math.min(100, pct));
  });

  const savingsRatioDisplay = $derived.by(() => {
    if (savingsRatio === null || !summary) return null;
    if (Math.abs(savingsRatio) === 100 && Math.abs(summary.net) > summary.total_income) {
      return null;
    }
    return savingsRatio;
  });

  // Whole span, not the selected period: overdue rows live in past months (the
  // 90-day lookback) and scheduled rows in future ones — a week-wide window
  // would drop both. Real forward rows arrive via the span fetch; projections
  // are read-time only, so ids never collide.
  const upcomingTxs = $derived.by(() => {
    const real = allScopedTxs.filter((tx) => tx.status === "upcoming" || tx.status === "overdue");
    const projected = [...currentProjectedTxs, ...forwardForecastTxs.filter((tx) => tx.projected)];
    return [...real, ...projected].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  });

  const overdueCount = $derived(allScopedTxs.filter((tx) => tx.status === "overdue").length);

  const activeRecurringCount = $derived(
    buildRecurringSeriesList(scopeFilter(recurringTemplatesQuery.data ?? [])).length
  );

  // "See all upcoming" mirrors the table's window: 90-day overdue lookback
  // through the forecast horizon.
  const upcomingHref = $derived.by(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - OVERDUE_LOOKBACK_DAYS);
    const end = forwardWindows.length
      ? previousDateOnly(forwardWindows[forwardWindows.length - 1].end)
      : (() => {
          const ahead = new Date(now);
          ahead.setDate(ahead.getDate() + UPCOMING_AHEAD_DAYS);
          return toIsoDate(ahead);
        })();
    const p = new URLSearchParams();
    p.set("startDate", toIsoDate(start));
    p.set("endDate", end);
    p.set("group", groupFilter);
    p.set("status", "upcoming,overdue");
    return `/transactions?${p.toString()}`;
  });

  function openTransaction(tx: TransactionWithCategory) {
    try {
      const startMs = new Date(bounds.start).getTime();
      const endMs = new Date(bounds.end).getTime();
      const txMs = new Date(tx.date).getTime();

      // If the transaction falls inside the currently selected dashboard window,
      // open the transactions view for that period so the row is visible.
      if (txMs >= startMs && txMs < endMs) {
        goto(transactionsHref({ status: tx.status, txId: tx.id }));
        return;
      }

      // Overdue/upcoming rows may live outside the current window (90-day lookback
      // + forecast horizon). For those, reuse the dashboard's upcoming span so the
      // target row appears in the list, and include txId so the sheet opens.
      if (tx.status === "upcoming" || tx.status === "overdue") {
        const sep = upcomingHref.includes("?") ? "&" : "?";
        goto(`${upcomingHref}${sep}txId=${encodeURIComponent(tx.id)}`);
        return;
      }

      // Fallback: open a one-day window for the transaction date and pass txId.
      const params = new URLSearchParams();
      params.set("startDate", toIsoDate(new Date(tx.date)));
      params.set("endDate", toIsoDate(new Date(tx.date)));
      params.set("txId", tx.id);
      params.set("group", groupFilter);
      goto(`/transactions?${params.toString()}`);
    } catch {
      // Best-effort fallback to the period link; include txId so transactions page
      // can fetch the row by id if needed.
      goto(transactionsHref({ status: tx.status, txId: tx.id }));
    }
  }

  const periodChips: { value: Period; label: string }[] = $derived([
    { value: "week", label: m.dashboard_period_week() },
    { value: "month", label: m.dashboard_period_month() },
    { value: "year", label: m.dashboard_period_year() },
  ]);

  function shortDateLabel(iso: string): string {
    const [, mm, dd] = iso.split("-");
    return `${dd}.${mm}`;
  }

  const activePeriodLabel = $derived(
    period === "custom" && customRange
      ? `${shortDateLabel(customRange.start)}–${shortDateLabel(customRange.end)}`
      : (periodChips.find((c) => c.value === period)?.label ?? "")
  );
</script>

<svelte:head>
  <title>{m.dashboard_title()} · JakStoimy</title>
</svelte:head>

<div class="container mx-auto max-w-4xl min-w-0 space-y-4 px-4 py-6 md:max-w-5xl">
  <!-- Header - mobile -->
  <div class="md:hidden">
    <p class="truncate text-base font-medium text-slate-100">
      {#if profileQuery.data}
        {greeting}, {profileQuery.data.name ?? profileQuery.data.email}!
      {:else}
        &nbsp;
      {/if}
    </p>
  </div>

  <!-- Header - desktop -->
  <div class="hidden items-start justify-between md:flex">
    <div>
      {#if profileQuery.data}
        <p class="mb-0.5 text-base text-slate-400">
          {greeting}, {profileQuery.data.name ?? profileQuery.data.email}!
        </p>
      {/if}
      <h1 class="text-hero font-semibold text-slate-100">
        {m.dashboard_title()}
      </h1>
    </div>
  </div>

  <!-- Period + scope toolbar -->
  <DashboardViewToolbar
    {period}
    {groupFilter}
    groups={groupsQuery.data ?? []}
    {periodChips}
    {customRange}
    onPeriodChange={setPeriod}
    onScopeChange={setGroupFilter}
    onRangeChange={setCustomRange}
    onRangeClear={() => setPeriod("week")}
  />

  {#if demoActive}
    <DemoShowcaseBanner
      onclear={async () => {
        await clearDemoMutation.mutateAsync();
      }}
      onrestart={() => restartTourMutation.mutate()}
      clearing={clearDemoMutation.isPending}
      restarting={restartTourMutation.isPending}
    />
  {/if}

  <!-- Bilans + spending — side by side from md up -->
  {#if txQuery.isLoading}
    <div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
      <div class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
      <div class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
    </div>
  {:else if txQuery.isError}
    <QueryError error={txQuery.error} onRetry={() => txQuery.refetch()} />
  {:else}
    <div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
      <DashboardBalanceHero
        periodLabel={activePeriodLabel}
        {summary}
        savingsRatio={savingsRatioDisplay}
        spent={spendingInsight.spent}
        categories={spendingInsight.categories}
        {showForecastNote}
        forecastNet={forecastSummary?.net}
        {transactionsHref}
        onOpenGlossary={openGlossary}
        bind:breakdownOpen={balanceExpanded}
      />

      <DashboardSpendingInsight
        insight={spendingInsight}
        {period}
        goalSplit={goalSpendingSplit}
        bind:expanded={spendingExpanded}
        categoryHref={(id) => (id ? transactionsHref({ categoryId: id }) : transactionsHref())}
      />
    </div>

    <!-- Multi-period spend comparison (last 6 weeks/months/years) -->
    <div class="mt-4">
      {#if isDesktop.current}
        <SpendHistoryChart
          buckets={combinedHistoryBuckets}
          {allocationByLabel}
          onselectperiod={selectHistoryPeriod}
          onOpenGlossary={openGlossary}
        />
      {:else}
        <div class="rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 p-4"
            aria-expanded={historyExpanded}
            onclick={() => (historyExpanded = !historyExpanded)}
          >
            <span class="text-sm font-medium text-slate-300">{m.dashboard_history_title()}</span>
            <ChevronDown
              size={17}
              strokeWidth={1.8}
              class={cn(
                "text-slate-400 transition-transform duration-300 ease-out",
                historyExpanded && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>
          <div
            class={cn("expand-grid", historyExpanded && "expand-grid--open")}
            aria-hidden={!historyExpanded}
          >
            <div class="expand-grid-inner">
              <div class="expand-grid-panel px-2 pb-2">
                <SpendHistoryChart
                  buckets={combinedHistoryBuckets}
                  {allocationByLabel}
                  onselectperiod={selectHistoryPeriod}
                  onOpenGlossary={openGlossary}
                />
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Status band -->
  <section class="mt-4">
    <h2 class="mb-1.5 text-sm font-medium text-slate-400">{m.dashboard_status_band()}</h2>
    <div class="grid min-w-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-2">
      <DashboardActions
        {overdueCount}
        insight={spendingInsight}
        periodKey={bounds.start}
        periodEnd={bounds.end}
      />
      <DashboardPlanProgress />
      <div class="grid min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
        <DashboardImportHealth />
        <DashboardNetWorthStrip />
      </div>
    </div>
  </section>

  <!-- Upcoming / overdue -->
  {#if !txQuery.isError}
    <div>
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-eyebrow text-slate-400">{m.dashboard_upcoming_title()}</p>
        <div class="flex items-center gap-3">
          {#if activeRecurringCount > 0}
            <a
              href="/transactions?status=upcoming"
              class="hover:text-accent text-xs font-medium text-slate-400 transition-colors"
            >
              {m.recurring_entry()} ({activeRecurringCount})
            </a>
          {/if}
          {#if upcomingTxs.length > 0}
            <a href={upcomingHref} class="text-accent hover:text-accent text-xs font-medium">
              {m.dashboard_upcoming_see_all()}
            </a>
          {/if}
        </div>
      </div>

      {#if txQuery.isPending}
        <div class="space-y-2">
          {#each Array(3) as _, i (i)}
            <div class="h-14 animate-pulse rounded-xl border border-white/5 bg-slate-900/60"></div>
          {/each}
        </div>
      {:else if upcomingTxs.length === 0}
        <div class="py-6 text-center">
          <p class="text-sm text-slate-400">{m.dashboard_empty_upcoming()}</p>
          <a
            href={upcomingHref}
            class="text-accent mt-2 inline-block text-sm font-medium hover:underline"
          >
            {m.dashboard_empty_upcoming_cta()}
          </a>
        </div>
      {:else}
        <TransactionTable
          transactions={upcomingTxs}
          selectedIds={new Set()}
          currentUserId={session.userId}
          canManage={dashCanManage}
          onrowclick={openTransaction}
          onsettle={quickSettle}
          initialSortDirection="asc"
        />
      {/if}
    </div>
  {/if}
</div>

<GlossarySheet
  open={glossaryOpen}
  focusEntryId={glossaryFocusId}
  source="tooltip"
  onclose={() => {
    glossaryOpen = false;
    glossaryFocusId = undefined;
  }}
/>
