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
  import DashboardOnboardingChecklist from "$lib/components/dashboard/DashboardOnboardingChecklist.svelte";
  import { fetchLastCommittedImportSession } from "$lib/services/bank-import";
  import { fetchPlans } from "$lib/services/plans";
  import { updateProfile, fetchProfile } from "$lib/services/profiles";
  import {
    buildOnboardingSteps,
    deriveOnboardingFromSignals,
    isOnboardingComplete,
    mergeOnboardingProgress,
    readOnboardingProgress,
  } from "$lib/services/onboarding-progress";
  import { fetchMyGroupRoles, fetchUserGroups } from "$lib/services/groups";
  import {
    computeForecastSummary,
    computeLedgerSummary,
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
  import { computeGoalSpendingSplit, resolveCeleCategoryId } from "$lib/services/goal-spending";
  import { fetchRecurringOccurrenceSkips } from "$lib/services/recurring-occurrences";
  import { forwardForecastTransactions } from "$lib/services/transaction-projections";
  import {
    buildPeriodWindows,
    buildForwardPeriodWindows,
    bucketPeriodHistory,
  } from "$lib/services/period-history";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import { supabase } from "$lib/supabase";
  import type { TransactionStatus, TransactionWithCategory } from "$lib/types";
  import type { Json } from "$lib/supabase.types";
  import { cn, getDateRangeBounds } from "$lib/utils";
  import { syncListViewUrl } from "$lib/utils/navigation";
  import {
    parseDashboardPeriod,
    parseScopeFilter,
    type DashboardPeriod,
    type ScopeFilter,
  } from "$lib/utils/list-view-url";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";
  import { ChevronDown } from "lucide-svelte";
  import { dailyGreeting, dailyQuote } from "$lib/dashboard-daily";

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let historyExpanded = $state(untrack(() => isDesktop.current));
  let balanceExpanded = $state(false);
  let spendingExpanded = $state(false);

  const greeting = dailyGreeting();
  const quote = dailyQuote();

  type Period = DashboardPeriod;
  const period = $derived(parseDashboardPeriod($page.url.searchParams));
  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));

  function setPeriod(next: Period) {
    syncListViewUrl("/dashboard", $page.url.searchParams, { period: next });
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
    const now = new Date();
    const params = new URLSearchParams();

    if (period === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      params.set("startDate", toIsoDate(start));
      params.set("endDate", toIsoDate(now));
    } else if (period === "year") {
      const year = now.getFullYear();
      params.set("startYear", String(year));
      params.set("startMonth", "1");
      params.set("endYear", String(year));
      params.set("endMonth", "12");
    } else {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      params.set("startYear", String(year));
      params.set("startMonth", String(month));
      params.set("endYear", String(year));
      params.set("endMonth", String(month));
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

  let userId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id ?? null;
  });

  const queryClient = useQueryClient();

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
    enabled: !!userId,
  }));

  function dashCanManage(tx: TransactionWithCategory): boolean {
    if (!userId) return false;
    return canManageTransaction(tx, userId, groupRolesQuery.data ?? new Map());
  }

  // Settling can flip a plan-linked transaction to paid, so plan progress must refresh too.
  async function invalidateAfterSettle() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
    await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
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
            void updateTransactionsStatus([vars.id], vars.prev).then(() => invalidateAfterSettle());
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
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: ["plans"],
    queryFn: fetchPlans,
    enabled: !!userId,
  }));

  const importHealthQuery = createQuery(() => ({
    queryKey: ["import-health"],
    queryFn: fetchLastCommittedImportSession,
    enabled: !!userId,
  }));

  const txCountQuery = createQuery(() => ({
    queryKey: ["transactions", "count-probe"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  }));

  const onboardingProgress = $derived.by(() => {
    const base = readOnboardingProgress(profileQuery.data?.settings);
    return deriveOnboardingFromSignals({
      progress: base,
      visitedDashboard: true,
      hasCommittedImport: !!importHealthQuery.data?.committed_at,
      transactionCount: txCountQuery.data ?? 0,
      hasPlanOrNetWorth: (plansQuery.data?.length ?? 0) > 0,
    });
  });

  const showOnboarding = $derived(!!profileQuery.data && !isOnboardingComplete(onboardingProgress));

  const onboardingSteps = $derived(buildOnboardingSteps(onboardingProgress));

  const dismissOnboardingMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!userId || !profileQuery.data) return;
      const next = mergeOnboardingProgress(readOnboardingProgress(profileQuery.data.settings), {
        dismissed: true,
        completed: onboardingProgress.completed,
      });
      await updateProfile(userId, {
        settings: {
          ...profileQuery.data.settings,
          onboarding: next as unknown as Json,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  }));

  const bounds = $derived.by(() => {
    const now = new Date();
    if (period === "week") {
      const end = new Date(now);
      end.setDate(end.getDate() + 1);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return {
        start: toIsoDate(start),
        end: toIsoDate(end),
        buckets: 7,
      };
    }
    if (period === "year") {
      const y = now.getFullYear();
      const b = getDateRangeBounds(y, 1, y, 12);
      return { start: b.start, end: b.end, buckets: 12 };
    }
    const y = now.getFullYear();
    const monthIdx = now.getMonth() + 1;
    const b = getDateRangeBounds(y, monthIdx, y, monthIdx);
    const daysInMonth = new Date(y, monthIdx, 0).getDate();
    return { start: b.start, end: b.end, buckets: daysInMonth };
  });

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
    enabled: !!userId,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    enabled: !!userId,
  }));

  const saveLinkedQuery = createQuery(() => ({
    queryKey: ["plan-save-linked-ids"],
    queryFn: fetchSaveLinkedTransactionIds,
    enabled: !!userId,
  }));

  const txQuery = createQuery(() => ({
    queryKey: ["transactions", "dashboard", period, bounds.start, bounds.end] as const,
    queryFn: () => fetchTransactions(bounds.start, bounds.end),
  }));

  const scopedTxs = $derived.by(() => {
    if (!txQuery.data) return [];
    return txQuery.data.filter((tx) => {
      return (
        groupFilter === "all" ||
        (groupFilter === "own" ? tx.group_id === null : tx.group_id === groupFilter)
      );
    });
  });
  const scopedLedgerTxs = $derived(ledgerTransactions(scopedTxs));

  const summary = $derived(
    scopedTxs.length > 0 || txQuery.data ? computeLedgerSummary(scopedTxs) : null
  );
  const forecastSummary = $derived(
    scopedTxs.length > 0 || txQuery.data ? computeForecastSummary(scopedTxs) : null
  );
  const showForecastNote = $derived(
    !!summary &&
      !!forecastSummary &&
      (summary.net !== forecastSummary.net ||
        summary.total_income !== forecastSummary.total_income ||
        summary.total_expenses !== forecastSummary.total_expenses)
  );

  // Previous-period bounds: shift the current window back by its own length.
  const prevBounds = $derived.by(() => {
    const now = new Date();
    const y = now.getFullYear();
    if (period === "year") {
      return getDateRangeBounds(y - 1, 1, y - 1, 12);
    }
    if (period === "week") {
      // week: previous 7-day window, contiguous with and exclusive of the current week start
      const start = new Date(bounds.start);
      start.setDate(start.getDate() - 7);
      return { start: toIsoDate(start), end: bounds.start };
    }
    const mo = now.getMonth() + 1;
    return mo === 1
      ? getDateRangeBounds(y - 1, 12, y - 1, 12)
      : getDateRangeBounds(y, mo - 1, y, mo - 1);
  });

  // Rolling window: last 3 complete periods before the current one (for averages).
  const ROLLING_PERIODS = 3;
  const rollingBounds = $derived.by(() => {
    const now = new Date();
    const y = now.getFullYear();
    if (period === "year") return getDateRangeBounds(y - ROLLING_PERIODS, 1, y - 1, 12);
    if (period === "week") {
      // rolling: last ROLLING_PERIODS complete weeks, contiguous with current week start
      const start = new Date(bounds.start);
      start.setDate(start.getDate() - 7 * ROLLING_PERIODS);
      return { start: toIsoDate(start), end: bounds.start };
    }
    const mo = now.getMonth() + 1;
    const startMonthIdx = mo - ROLLING_PERIODS;
    const startYear = startMonthIdx > 0 ? y : y - 1;
    const startMonth = ((startMonthIdx - 1 + 12) % 12) + 1;
    const endYear = mo === 1 ? y - 1 : y;
    const endMonth = mo === 1 ? 12 : mo - 1;
    return getDateRangeBounds(startYear, startMonth, endYear, endMonth);
  });

  const prevTxQuery = createQuery(() => ({
    queryKey: ["transactions", "dashboard-prev", period, prevBounds.start, prevBounds.end] as const,
    queryFn: () => fetchTransactions(prevBounds.start, prevBounds.end),
  }));
  const rollingTxQuery = createQuery(() => ({
    queryKey: [
      "transactions",
      "dashboard-rolling",
      period,
      rollingBounds.start,
      rollingBounds.end,
    ] as const,
    queryFn: () => fetchTransactions(rollingBounds.start, rollingBounds.end),
  }));

  function scopeFilter(list: TransactionWithCategory[]) {
    return list.filter(
      (tx) =>
        groupFilter === "all" ||
        (groupFilter === "own" ? tx.group_id === null : tx.group_id === groupFilter)
    );
  }

  const previousLedgerTxs = $derived(ledgerTransactions(scopeFilter(prevTxQuery.data ?? [])));
  const rollingLedgerTxs = $derived(ledgerTransactions(scopeFilter(rollingTxQuery.data ?? [])));

  const spendingInsight = $derived(
    computeSpendingInsight({
      current: scopedLedgerTxs,
      previous: previousLedgerTxs,
      rolling: rollingLedgerTxs,
      periodsInRolling: ROLLING_PERIODS,
      budgets: [],
    })
  );

  const goalSpendingSplit = $derived(
    computeGoalSpendingSplit(
      scopedLedgerTxs,
      saveLinkedQuery.data ?? new Set(),
      resolveCeleCategoryId(categoriesQuery.data ?? [])
    )
  );

  // Multi-period comparison history: last 6 periods (weeks/months/years per toggle).
  const HISTORY_PERIODS = 6;
  const historyWindows = $derived(buildPeriodWindows(period, HISTORY_PERIODS));
  const historyBounds = $derived({
    start: historyWindows[0].start,
    end: historyWindows[historyWindows.length - 1].end,
  });
  const historyTxQuery = createQuery(() => ({
    queryKey: [
      "transactions",
      "dashboard-history",
      period,
      historyBounds.start,
      historyBounds.end,
    ] as const,
    queryFn: () => fetchTransactions(historyBounds.start, historyBounds.end),
  }));
  const historyBuckets = $derived(
    bucketPeriodHistory(ledgerTransactions(scopeFilter(historyTxQuery.data ?? [])), historyWindows)
  );

  // Recurring-template projection: next 3 periods appended as isProjected buckets.
  const FORWARD_PERIODS = 3;
  const recurringTemplatesQuery = createQuery(() => ({
    queryKey: ["transactions", "recurring-templates"] as const,
    queryFn: fetchRecurringTemplates,
  }));
  const forwardWindows = $derived(buildForwardPeriodWindows(period, FORWARD_PERIODS));
  const forwardBounds = $derived({
    start: forwardWindows[0].start,
    end: forwardWindows[forwardWindows.length - 1].end,
  });
  const forwardRealTxQuery = createQuery(() => ({
    queryKey: [
      "transactions",
      "dashboard-forward-real",
      period,
      forwardBounds.start,
      forwardBounds.end,
    ] as const,
    queryFn: () => fetchTransactions(forwardBounds.start, forwardBounds.end),
  }));
  const forwardRecurringSkipsQuery = createQuery(() => ({
    queryKey: [
      "transactions",
      "dashboard-forward-recurring-skips",
      forwardBounds.start,
      forwardBounds.end,
    ] as const,
    queryFn: () => fetchRecurringOccurrenceSkips(forwardBounds.start, forwardBounds.end),
  }));
  // Forecast source = scheduled real rows (one-off upcoming + materialized
  // recurring occurrences) UNIONed with deduped projections — so the chart's
  // forecast region agrees with the /transactions upcoming list for a window,
  // instead of under-reporting by showing recurring projections only.
  const forwardForecastTxs = $derived.by(() => {
    if (forwardWindows.length === 0) return [];
    return forwardForecastTransactions({
      templates: scopeFilter(recurringTemplatesQuery.data ?? []),
      existing: scopeFilter(forwardRealTxQuery.data ?? []),
      skipped: forwardRecurringSkipsQuery.data ?? [],
      start: forwardWindows[0].start,
      end: forwardWindows[forwardWindows.length - 1].end,
    });
  });
  const forwardBuckets = $derived(
    bucketPeriodHistory(forwardForecastTxs, forwardWindows).map((b) => ({
      ...b,
      isProjected: true,
    }))
  );
  const combinedHistoryBuckets = $derived([...historyBuckets, ...forwardBuckets]);

  const savingsRatio = $derived.by(() => {
    if (!summary) return null;
    if (summary.total_income <= 0) return null;
    return Math.round((summary.net / summary.total_income) * 100);
  });

  const upcomingTxs = $derived.by(() => {
    const real = scopedTxs.filter((tx) => tx.status === "upcoming" || tx.status === "overdue");
    const projected = forwardForecastTxs.filter((tx) => tx.projected);
    return [...real, ...projected].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  });

  const overdueCount = $derived(scopedTxs.filter((tx) => tx.status === "overdue").length);

  const activeRecurringCount = $derived(
    buildRecurringSeriesList(recurringTemplatesQuery.data ?? []).length
  );

  // "See all upcoming" must span the whole forecast horizon, not the dashboard's
  // selected period — upcoming/overdue rows sit in future months and a week-wide
  // window would land on an empty range.
  const upcomingHref = $derived.by(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = forwardWindows.length
      ? previousDateOnly(forwardWindows[forwardWindows.length - 1].end)
      : toIsoDate(now);
    const p = new URLSearchParams();
    p.set("startDate", toIsoDate(start));
    p.set("endDate", end);
    p.set("group", groupFilter);
    p.set("status", "upcoming,overdue");
    return `/transactions?${p.toString()}`;
  });

  function openTransaction(tx: TransactionWithCategory) {
    goto(transactionsHref({ status: tx.status }));
  }

  const periodChips: { value: Period; label: string }[] = $derived([
    { value: "week", label: m.dashboard_period_week() },
    { value: "month", label: m.dashboard_period_month() },
    { value: "year", label: m.dashboard_period_year() },
  ]);
  const activePeriodLabel = $derived(periodChips.find((c) => c.value === period)?.label ?? "");
</script>

<svelte:head>
  <title>{m.dashboard_title()} · Portfelik</title>
</svelte:head>

<div class="container mx-auto max-w-4xl min-w-0 space-y-4 px-4 py-6 md:max-w-5xl">
  <!-- Header - mobile (single line greeting + quote underneath) -->
  <div class="md:hidden">
    <p class="truncate text-base font-medium text-slate-100">
      {#if profileQuery.data}
        {greeting}, {profileQuery.data.name ?? profileQuery.data.email}!
      {:else}
        &nbsp;
      {/if}
    </p>
    <p class="mt-1 line-clamp-2 text-xs text-slate-400 italic">
      {quote}
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
      <p class="mt-1 max-w-xl text-sm text-slate-400 italic">{quote}</p>
    </div>
  </div>

  <!-- Period + scope toolbar -->
  <DashboardViewToolbar
    {period}
    {groupFilter}
    groups={groupsQuery.data ?? []}
    {periodChips}
    onPeriodChange={setPeriod}
    onScopeChange={setGroupFilter}
  />

  {#if showOnboarding}
    <DashboardOnboardingChecklist
      steps={onboardingSteps}
      onDismiss={() => dismissOnboardingMutation.mutate()}
      onNavigate={(href) => void goto(href)}
    />
  {/if}

  <!-- Bilans + spending — side by side from md up -->
  <div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
    <DashboardBalanceHero
      periodLabel={activePeriodLabel}
      {summary}
      {savingsRatio}
      spent={spendingInsight.spent}
      categories={spendingInsight.categories}
      {showForecastNote}
      forecastNet={forecastSummary?.net}
      {transactionsHref}
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
      <SpendHistoryChart buckets={combinedHistoryBuckets} onselectperiod={selectHistoryPeriod} />
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
                onselectperiod={selectHistoryPeriod}
              />
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Status band -->
  <section class="mt-4">
    <h2 class="mb-1.5 text-sm font-medium text-slate-400">{m.dashboard_status_band()}</h2>
    <div class="grid min-w-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-2">
      <DashboardActions
        {userId}
        {overdueCount}
        insight={spendingInsight}
        periodKey={bounds.start}
      />
      <DashboardPlanProgress />
      <div class="grid min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
        <DashboardImportHealth />
        <DashboardNetWorthStrip />
      </div>
    </div>
  </section>

  <!-- Upcoming / overdue -->
  <div>
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="text-eyebrow text-slate-400">{m.dashboard_upcoming_title()}</p>
      <div class="flex items-center gap-3">
        {#if activeRecurringCount > 0}
          <a
            href="/recurring"
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
    {:else if txQuery.isError}
      <QueryError error={txQuery.error} onRetry={() => txQuery.refetch()} />
    {:else if upcomingTxs.length === 0}
      <p class="py-6 text-center text-sm text-slate-400">
        {m.dashboard_empty_upcoming()}
      </p>
    {:else}
      <TransactionTable
        transactions={upcomingTxs}
        selectedIds={new Set()}
        currentUserId={userId}
        canManage={dashCanManage}
        onrowclick={openTransaction}
        onsettle={quickSettle}
      />
    {/if}
  </div>
</div>
