<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import DashboardImportHealth from "$lib/components/dashboard/DashboardImportHealth.svelte";
  import DashboardPiles from "$lib/components/dashboard/DashboardPiles.svelte";
  import DashboardActions from "$lib/components/dashboard/DashboardActions.svelte";
  import DashboardPlanProgress from "$lib/components/dashboard/DashboardPlanProgress.svelte";
  import DashboardCashPosition from "$lib/components/dashboard/DashboardCashPosition.svelte";
  import DashboardViewToolbar from "$lib/components/dashboard/DashboardViewToolbar.svelte";
  import DashboardDiscovery from "$lib/components/dashboard/DashboardDiscovery.svelte";
  import * as m from "$lib/paraglide/messages";
  import DemoShowcaseBanner from "$lib/components/onboarding/DemoShowcaseBanner.svelte";
  import GlossarySheet from "$lib/components/ui/GlossarySheet.svelte";
  import { track } from "$lib/analytics";
  import {
    clearDemoData,
    fetchDemoProbe,
    hasDemoData,
    isDiscoveryLedger,
  } from "$lib/services/demo-data";
  import { refreshDemoState } from "$lib/services/demo-query-state";
  import { resetGuidedTourForReplay } from "$lib/services/guided-tour-actions";
  import { guidedTourUi } from "$lib/guided-tour/ui.svelte";
  import { fetchPlans } from "$lib/services/plans";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchMyGroupRoles, fetchUserGroups } from "$lib/services/groups";
  import {
    fetchRecurringTemplates,
    fetchTransactionCount,
    fetchTransactions,
    fetchTransactionsByStatus,
    updateTransactionStatus,
  } from "$lib/services/transactions";
  import { buildRecurringSeriesList } from "$lib/services/recurring-series";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchSaveLinkedTransactionIds } from "$lib/services/plan-settlement";
  import { resolveCeleCategoryId } from "$lib/services/goal-spending";
  import { fetchRecurringOccurrenceSkips } from "$lib/services/recurring-occurrences";
  import { localDateIso } from "$lib/date-local";
  import {
    buildCockpitMonthView,
    cockpitForecastChart,
    type CockpitMonthRow,
  } from "$lib/cockpit/month-view";
  import { takeCockpitImportReveal } from "$lib/cockpit/import-reveal";
  import {
    calendarMonthBounds,
    calendarMonthFromIso,
    calendarMonthLabel,
    cockpitMonthFetchBounds,
  } from "$lib/cockpit/month-window";
  import {
    CASH_FETCH_END_SENTINEL,
    cashForecastProjectionEnd,
    fetchPrivateCashPosition,
  } from "$lib/services/cash-position";
  import { fetchPrivateSpendForecastSource } from "$lib/services/spend-forecast";
  import {
    forwardForecastTransactions,
    recurringProjectionsForTransactionRange,
  } from "$lib/services/transaction-projections";
  import { buildForwardPeriodWindows } from "$lib/services/period-history";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import type { TransactionStatus, TransactionWithCategory } from "$lib/types";
  import { getDateRangeBounds } from "$lib/utils";
  import { syncListViewUrl } from "$lib/utils/navigation";
  import { parseScopeFilter, type ScopeFilter } from "$lib/utils/list-view-url";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";

  let importRevealCount = $state<number | null>(null);
  onMount(() => {
    importRevealCount = takeCockpitImportReveal();
  });

  let detailsOpen = $state(false);

  const greetingName = $derived.by(() => {
    const raw =
      profileQuery.data?.settings.preferredName?.trim() || profileQuery.data?.name?.trim();
    return raw ?? "";
  });

  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));

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
    // Mirror the dashboard's exact [start, end) window as an inclusive list range.
    params.set("startDate", bounds.start.slice(0, 10));
    params.set("endDate", previousDateOnly(bounds.end));
    params.set("group", groupFilter);

    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
    return `/transactions?${params.toString()}`;
  }

  function analysisHref(): string {
    if (groupFilter === "own") return "/analysis";
    return `/analysis?group=${encodeURIComponent(groupFilter)}`;
  }

  function previousDateOnly(value: string): string {
    const d = new Date(value);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  const queryClient = useQueryClient();

  const groupRolesQuery = createQuery(() => ({
    queryKey: qk.myGroupRoles(session.userId!),
    queryFn: fetchMyGroupRoles,
    enabled: !!session.userId,
  }));

  function dashCanManage(tx: TransactionWithCategory): boolean {
    if (!session.userId) return false;
    return canManageTransaction(tx, session.userId, groupRolesQuery.data ?? new Map());
  }

  // Settling can flip a plan-linked transaction to paid, so plan progress must refresh too.
  async function invalidateAfterSettle() {
    const u = requireSessionUserId();
    await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
    await queryClient.invalidateQueries({ queryKey: qk.spendForecast(u) });
    await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
    await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
    await queryClient.invalidateQueries({ queryKey: qk.planMatches(u) });
  }

  const settleMutation = createMutation(() => ({
    mutationFn: (vars: { id: string; prev: TransactionStatus; type: "income" | "expense" }) =>
      updateTransactionStatus(vars.id, "paid"),
    onSuccess: async (_data, vars) => {
      await invalidateAfterSettle();
      toast.success(
        vars.type === "income" ? m.toast_transaction_received() : m.toast_transaction_settled(),
        {
          action: {
            label: m.toast_transaction_settle_undo(),
            onClick: () => {
              void updateTransactionStatus(vars.id, vars.prev)
                .then(() => invalidateAfterSettle())
                .catch((err) => toastError(err));
            },
          },
        }
      );
    },
    onError: (err) => toastError(err),
  }));

  function quickSettle(tx: TransactionWithCategory) {
    settleMutation.mutate({ id: tx.id, prev: tx.status, type: tx.type });
  }

  const profileQuery = createQuery(() => ({
    queryKey: qk.profile(session.userId!),
    queryFn: () => fetchProfile(session.userId!),
    enabled: !!session.userId,
  }));

  const cashAnchorQuery = createQuery(() => ({
    queryKey: qk.cashPosition(session.userId!),
    queryFn: fetchPrivateCashPosition,
    enabled: !!session.userId,
  }));

  const cashAnchorStart = $derived(cashAnchorQuery.data?.as_of_date ?? "2000-01-01");
  const cashHistoryQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "cash-history", cashAnchorStart),
    queryFn: () => fetchTransactions(cashAnchorStart, CASH_FETCH_END_SENTINEL),
    // Boolean (not `() =>`) so `$derived` tracks cashAnchorQuery and re-enables
    // when the anchor lands. Lazy enabled callbacks close over stale deps.
    enabled: !!session.userId && cashAnchorQuery.isSuccess && !!cashAnchorQuery.data,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: qk.plans(session.userId!),
    queryFn: fetchPlans,
    enabled: !!session.userId,
  }));

  const demoProbeQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "demo-probe"),
    queryFn: fetchDemoProbe,
    enabled: !!session.userId,
    staleTime: 60_000,
  }));

  const txCountQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "all-time-count"),
    queryFn: fetchTransactionCount,
    enabled: !!session.userId,
    staleTime: 60_000,
  }));

  const demoActive = $derived(
    hasDemoData({
      transactions: demoProbeQuery.data?.transactions ?? [],
      plans: plansQuery.data ?? [],
      netWorthItems: demoProbeQuery.data?.netWorthItems ?? [],
    })
  );

  // Only the discovery decision depends on these auxiliary queries. Cash and
  // period totals must render independently when plans/demo checks are slow.
  const ledgerReady = $derived(
    !!session.userId &&
      txCountQuery.isSuccess &&
      demoProbeQuery.isSuccess &&
      plansQuery.isSuccess &&
      cashAnchorQuery.isSuccess
  );
  const discovery = $derived(
    ledgerReady &&
      !cashAnchorQuery.isError &&
      !cashAnchorQuery.data &&
      typeof txCountQuery.data === "number" &&
      isDiscoveryLedger({ demoActive, transactionCount: txCountQuery.data }) &&
      !guidedTourUi.running
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
      await refreshDemoState(queryClient, u);
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

  // Kokpit stays on the current calendar month. Category history lives in Analiza budżetu.
  const bounds = $derived.by(() => {
    const now = new Date();
    return getDateRangeBounds(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getFullYear(),
      now.getMonth() + 1
    );
  });

  const groupsQuery = createQuery(() => ({
    queryKey: qk.userGroups(session.userId!),
    queryFn: fetchUserGroups,
    enabled: !!session.userId,
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

  const forwardWindows = $derived(buildForwardPeriodWindows("month", 3));
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
    const start = toIsoDate(lookback);
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
    enabled: !!session.userId,
    staleTime: 60_000,
  }));

  // Actionable overdue debt is not bounded by the chart history. Keep this
  // separate so an old unpaid row cannot silently disappear from the action panel.
  const overdueQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "dashboard-overdue"),
    queryFn: () => fetchTransactionsByStatus("overdue"),
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
  const saveLinkedIds = $derived(saveLinkedQuery.data ?? new Set<string>());
  const celeCategoryId = $derived(resolveCeleCategoryId(categoriesQuery.data ?? []));

  const recurringTemplatesQuery = createQuery(() => ({
    queryKey: qk.transactions.list(session.userId!, "recurring-templates"),
    queryFn: fetchRecurringTemplates,
    enabled: !!session.userId,
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
    enabled: !!session.userId,
    staleTime: 60_000,
  }));

  // The headline cash forecast has a fixed horizon independent of the selected
  // reporting period. A week dashboard view must still account for the same
  // 90-day obligations as the private cash view in Transakcje.
  const cashForecastToday = $derived(localDateIso());
  const cashProjectionEnd = $derived(cashForecastProjectionEnd(cashForecastToday));
  const cashRecurringSkipsQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "dashboard-cash-recurring-skips",
      cashForecastToday,
      cashProjectionEnd
    ),
    queryFn: () => fetchRecurringOccurrenceSkips(cashForecastToday, cashProjectionEnd),
    // Must read cashAnchorQuery.data during options() so enabled flips when the
    // anchor resolves. A lazy `() => !!cashAnchorQuery.data` never re-runs when
    // the queryKey is unchanged — leaving the query disabled (isPending forever).
    enabled: !!session.userId && !!cashAnchorQuery.data,
    staleTime: 60_000,
  }));

  const privateCashProjectedTxs = $derived.by(() => {
    if (!cashAnchorQuery.data) return [];
    const privateTemplates = (recurringTemplatesQuery.data ?? []).filter(
      (tx) => (tx.group_id ?? null) === null
    );
    if (privateTemplates.length === 0) return [];
    const privateReal = (cashHistoryQuery.data ?? []).filter(
      (tx) => (tx.group_id ?? null) === null
    );
    return recurringProjectionsForTransactionRange({
      templates: privateTemplates,
      existing: privateReal,
      skipped: cashRecurringSkipsQuery.data ?? [],
      start: cashForecastToday,
      end: cashProjectionEnd,
    }).map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      status: tx.status,
      date: tx.date,
      currency: tx.currency,
    }));
  });
  // Plan remainders join the month counters when they arrive. They must not
  // hold the cash skeleton behind the plans request.
  const spendForecastQuery = createQuery(() => ({
    queryKey: qk.spendForecast(session.userId!),
    queryFn: fetchPrivateSpendForecastSource,
    enabled: !!session.userId && !!cashAnchorQuery.data,
    staleTime: 60_000,
  }));
  // The cash forecast stays on the current month. Longer ranges live in Analiza budżetu.
  const forecastMonth = $derived(calendarMonthFromIso(localDateIso()));
  const forecastRange = $derived(calendarMonthBounds(forecastMonth));
  const cockpitMonthFetch = $derived(cockpitMonthFetchBounds(forecastMonth));
  const cockpitMonthLedgerQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "cockpit-month",
      cockpitMonthFetch.start,
      cockpitMonthFetch.endExclusive
    ),
    queryFn: () => fetchTransactions(cockpitMonthFetch.start, cockpitMonthFetch.endExclusive),
    enabled: !!session.userId,
    staleTime: 60_000,
  }));
  const cashScopeLabel = $derived.by(() => {
    if (groupFilter === "all") return m.dashboard_scope_all();
    if (groupFilter === "own") return m.dashboard_scope_own();
    return (
      groupsQuery.data?.find((group) => group.id === groupFilter)?.name ?? m.visual_icon_home()
    );
  });

  function monthRow(tx: {
    id: string;
    type: "income" | "expense";
    amount: number;
    status: string;
    date: string;
    currency: string;
    group_id?: string | null;
    category_id?: string | null;
  }): CockpitMonthRow {
    return {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      status: tx.status,
      date: tx.date,
      currency: tx.currency,
      groupId: tx.group_id ?? null,
      categoryId: tx.category_id ?? null,
    };
  }

  // The chart span is shorter than a household month. Counters use the full
  // calendar fetch, and Wydatki stay empty until that fetch succeeds.
  const cockpitMonthRows = $derived.by(() => {
    const history = (cashHistoryQuery.data ?? []).map(monthRow);
    const projected = privateCashProjectedTxs.map((tx) =>
      monthRow({ ...tx, group_id: null, category_id: null })
    );
    const listed = cockpitMonthLedgerQuery.isSuccess
      ? (cockpitMonthLedgerQuery.data ?? []).map(monthRow)
      : [];
    return [...history, ...projected, ...listed];
  });
  const cockpitMonth = $derived(
    buildCockpitMonthView({
      scopeFilter: groupFilter,
      month: forecastMonth,
      range: { start: forecastRange.monthStart, end: forecastRange.monthEnd },
      today: cashForecastToday,
      privateAnchor: cashAnchorQuery.data
        ? {
            opening_amount: cashAnchorQuery.data.opening_amount,
            as_of_date: cashAnchorQuery.data.as_of_date,
            balance_semantics: cashAnchorQuery.data.balance_semantics,
          }
        : null,
      rows: cockpitMonthRows,
      items: spendForecastQuery.data?.items ?? [],
      links: spendForecastQuery.data?.links ?? [],
      saveLinkedIds,
      celeCategoryId,
      monthLedger: cockpitMonthLedgerQuery.isSuccess ? "complete" : "partial",
    })
  );
  const cockpitChart = $derived(
    cockpitForecastChart({
      scopeFilter: groupFilter,
      month: forecastMonth,
      range: { start: forecastRange.monthStart, end: forecastRange.monthEnd },
      today: cashForecastToday,
      privateAnchor: cashAnchorQuery.data
        ? {
            opening_amount: cashAnchorQuery.data.opening_amount,
            as_of_date: cashAnchorQuery.data.as_of_date,
            balance_semantics: cashAnchorQuery.data.balance_semantics,
          }
        : null,
      rows: cockpitMonthRows,
      items: spendForecastQuery.data?.items ?? [],
      links: spendForecastQuery.data?.links ?? [],
      saveLinkedIds,
      celeCategoryId,
      monthLedger: cockpitMonthLedgerQuery.isSuccess ? "complete" : "partial",
    })
  );

  // Prefer isLoading (pending + fetching) over isPending. Disabled dependents
  // stay isPending=true and would otherwise freeze the cash skeleton forever.
  const cashPositionLoading = $derived(
    !session.userId ||
      cashAnchorQuery.isPending ||
      cockpitMonthLedgerQuery.isLoading ||
      (!!cashAnchorQuery.data &&
        (cashHistoryQuery.isLoading ||
          recurringTemplatesQuery.isLoading ||
          cashRecurringSkipsQuery.isLoading))
  );
  const cashPositionError = $derived(
    cashAnchorQuery.isError ||
      cockpitMonthLedgerQuery.isError ||
      (!!cashAnchorQuery.data &&
        (cashHistoryQuery.isError ||
          recurringTemplatesQuery.isError ||
          cashRecurringSkipsQuery.isError))
  );
  function retryCashPosition() {
    void Promise.all([
      cashAnchorQuery.refetch(),
      cashHistoryQuery.refetch(),
      cockpitMonthLedgerQuery.refetch(),
      recurringTemplatesQuery.refetch(),
      cashRecurringSkipsQuery.refetch(),
      spendForecastQuery.refetch(),
    ]);
  }
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
  // Read-time projections inside the current month. Same
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

  // Whole span, not only this month: overdue rows live in the past (the
  // 90-day lookback) and scheduled rows in future ones — a week-wide window
  // would drop both. Real forward rows arrive via the span fetch; projections
  // are read-time only, so ids never collide.
  const upcomingTxs = $derived.by(() => {
    const real = allScopedTxs.filter((tx) => tx.status === "upcoming" || tx.status === "overdue");
    const projected = [...currentProjectedTxs, ...forwardForecastTxs.filter((tx) => tx.projected)];
    return [...real, ...projected].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  });

  const overdueSummary = $derived.by(() => {
    const overdue = scopeFilter(overdueQuery.data ?? []).filter((tx) => tx.currency === "PLN");
    if (overdue.length === 0) return null;

    const dates = overdue.map((tx) => tx.date.slice(0, 10)).sort();
    const oldestDate = dates[0];
    const newestDate = dates[dates.length - 1];
    const today = toIsoDate(new Date());
    const oldestDays = Math.max(
      0,
      Math.floor(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestDate}T00:00:00Z`)) / 86_400_000
      )
    );

    return {
      count: overdue.length,
      total: overdue.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0),
      oldestDays,
      startDate: oldestDate,
      endDate: newestDate,
    };
  });

  const overdueState = $derived(
    overdueQuery.isPending ? "pending" : overdueQuery.isError ? "error" : "success"
  );

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
          return previousDateOnly(toIsoDate(ahead));
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
</script>

<svelte:head>
  <title>{m.dashboard_title()} · JakStoimy</title>
</svelte:head>

<div class="container mx-auto max-w-4xl min-w-0 space-y-4 px-4 py-6 md:max-w-5xl">
  <!-- Header - mobile -->
  <div class="md:hidden">
    <h1 class="truncate text-2xl font-semibold tracking-tight text-slate-100">
      {#if profileQuery.isSuccess}
        {greetingName ? m.dashboard_greeting({ name: greetingName }) : m.dashboard_greeting_plain()}
      {:else}
        &nbsp;
      {/if}
    </h1>
  </div>

  <!-- Header - desktop -->
  <div class="hidden items-start justify-between md:flex">
    <div>
      {#if profileQuery.isSuccess}
        <h1 class="text-2xl font-semibold tracking-tight text-slate-100">
          {greetingName
            ? m.dashboard_greeting({ name: greetingName })
            : m.dashboard_greeting_plain()}
        </h1>
      {/if}
      <p class="mt-1 text-sm text-slate-400">{m.dashboard_title()}</p>
    </div>
  </div>

  {#if discovery}
    <DashboardDiscovery />
  {:else}
    {#if (groupsQuery.data ?? []).length > 0}
      <DashboardViewToolbar
        period="month"
        {groupFilter}
        groups={groupsQuery.data ?? []}
        periodChips={[]}
        showPeriod={false}
        onPeriodChange={() => {}}
        onScopeChange={setGroupFilter}
        onRangeChange={() => {}}
        onRangeClear={() => {}}
      />
    {/if}
    <DashboardCashPosition
      hasAnchor={!!cashAnchorQuery.data}
      showPrivateDetails={groupFilter === "own"}
      scopeLabel={cashScopeLabel}
      transactionsHref={`/transactions?startDate=${forecastRange.monthStart}&endDate=${forecastRange.monthEnd}&group=${groupFilter}`}
      balance={cockpitMonth.balance}
      expensesFrom={cockpitMonth.expensesFrom}
      expensesIncomplete={cockpitMonth.expensesIncomplete}
      monthForecast={cockpitMonth.forecast}
      orientational={cockpitMonth.orientational}
      chart={cockpitChart}
      horizonLabel={calendarMonthLabel(forecastMonth)}
      anchorDate={cashAnchorQuery.data?.as_of_date ?? null}
      analysisHref={analysisHref()}
      projected={cashForecastToday <= forecastRange.monthEnd}
      demo={demoActive}
      revealCount={importRevealCount}
      loading={cashPositionLoading}
      error={cashPositionError}
      onRetry={retryCashPosition}
      onOpenGlossary={openGlossary}
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

    <DashboardActions {groupFilter} overdue={overdueSummary} {overdueState} />
    <DashboardPiles {groupFilter} groups={groupsQuery.data ?? []} />

    {#if txQuery.isError}
      <QueryError error={txQuery.error} onRetry={() => txQuery.refetch()} />
    {:else if !txQuery.isLoading}
      <a
        href={transactionsHref()}
        class="text-accent focus-visible:ring-accent flex min-h-11 w-fit items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.dashboard_balance_all_link()}
      </a>
    {/if}

    <button
      type="button"
      class="focus-visible:ring-accent text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
      aria-expanded={detailsOpen}
      onclick={() => (detailsOpen = !detailsOpen)}
    >
      {m.dashboard_see_more()}
    </button>

    {#if detailsOpen}
      <DashboardPlanProgress {groupFilter} />

      <!-- Upcoming / overdue -->
      {#if !txQuery.isError}
        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="text-eyebrow text-slate-400">{m.dashboard_upcoming_title()}</p>
            <div class="flex items-center gap-3">
              {#if activeRecurringCount > 0}
                <span class="text-xs text-slate-400">
                  {m.recurring_entry()} ({activeRecurringCount})
                </span>
              {/if}
              {#if upcomingTxs.length > 0 || activeRecurringCount > 0}
                <a href={upcomingHref} class="text-accent hover:text-accent text-xs font-medium">
                  {m.dashboard_upcoming_see_all()}
                </a>
              {/if}
            </div>
          </div>

          {#if txQuery.isPending}
            <div class="space-y-2">
              {#each Array(3) as _, i (i)}
                <div
                  class="h-14 animate-pulse rounded-xl border border-white/5 bg-slate-900/60"
                ></div>
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
    {/if}

    <DashboardImportHealth />
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
