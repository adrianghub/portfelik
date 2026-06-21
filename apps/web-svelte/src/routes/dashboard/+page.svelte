<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import DashboardImportHealth from "$lib/components/dashboard/DashboardImportHealth.svelte";
  import DashboardAttention from "$lib/components/dashboard/DashboardAttention.svelte";
  import DashboardNetWorthStrip from "$lib/components/dashboard/DashboardNetWorthStrip.svelte";
  import DashboardPlanProgress from "$lib/components/dashboard/DashboardPlanProgress.svelte";
  import DashboardSpendingInsight from "$lib/components/dashboard/DashboardSpendingInsight.svelte";
  import SpendHistoryChart from "$lib/components/dashboard/charts/SpendHistoryChart.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchMyGroupRoles, fetchUserGroups } from "$lib/services/groups";
  import {
    computeForecastSummary,
    computeLedgerSummary,
    ledgerTransactions,
  } from "$lib/services/transaction-cashflow";
  import { fetchTransactions, updateTransactionsStatus } from "$lib/services/transactions";
  import { computeSpendingInsight } from "$lib/services/spending-insight";
  import { buildPeriodWindows, bucketPeriodHistory } from "$lib/services/period-history";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import { toast } from "svelte-sonner";
  import { supabase } from "$lib/supabase";
  import type { TransactionStatus, TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, getDateRangeBounds } from "$lib/utils";
  import { syncListViewUrl } from "$lib/utils/navigation";
  import {
    parseDashboardPeriod,
    parseScopeFilter,
    type DashboardPeriod,
    type ScopeFilter,
  } from "$lib/utils/list-view-url";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { dailyGreeting, dailyQuote } from "$lib/dashboard-daily";

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
  function selectHistoryPeriod(bucket: { start: string; end: string }): void {
    // bucket.end is exclusive; the transactions range wants an inclusive last day.
    const endIncl = new Date(`${bucket.end}T00:00:00`);
    endIncl.setDate(endIncl.getDate() - 1);
    const params = new URLSearchParams();
    params.set("startDate", bucket.start);
    params.set("endDate", toIsoDate(endIncl));
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
    onError: () => toast.error(m.toast_error()),
  }));

  function quickSettle(tx: TransactionWithCategory) {
    settleMutation.mutate({ id: tx.id, prev: tx.status });
  }

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
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

  const savingsRatio = $derived.by(() => {
    if (!summary) return null;
    if (summary.total_income <= 0) return null;
    return Math.round((summary.net / summary.total_income) * 100);
  });

  const upcomingTxs = $derived(
    scopedTxs.filter((tx) => tx.status === "upcoming" || tx.status === "overdue").slice(0, 5)
  );

  const overdueCount = $derived(scopedTxs.filter((tx) => tx.status === "overdue").length);

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

<div class="container mx-auto max-w-4xl space-y-5 px-4 py-6">
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

  <!-- Period chips -->
  <div role="tablist" aria-label="Okres" class="flex gap-1">
    {#each periodChips as chip (chip.value)}
      <button
        type="button"
        role="tab"
        aria-selected={period === chip.value}
        onclick={() => setPeriod(chip.value)}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          period === chip.value
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {chip.label}
      </button>
    {/each}
  </div>

  {#if (groupsQuery.data?.length ?? 0) > 0}
    <div role="tablist" aria-label={m.dashboard_scope_all()} class="flex flex-wrap gap-1">
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === "own"}
        onclick={() => setGroupFilter("own")}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          groupFilter === "own" ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5"
        )}
      >
        {m.dashboard_scope_own()}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === "all"}
        onclick={() => setGroupFilter("all")}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          groupFilter === "all" ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5"
        )}
      >
        {m.dashboard_scope_all()}
      </button>
      {#each groupsQuery.data ?? [] as g (g.id)}
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === g.id}
          onclick={() => setGroupFilter(g.id)}
          class={cn(
            "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
            groupFilter === g.id ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5"
          )}
        >
          {g.name}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Bilans hero + inline income / expense / savings -->
  <section
    class="relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur"
  >
    <span class="glow-disc absolute -top-12 -right-12 h-40 w-40" aria-hidden="true"></span>
    <div class="relative flex items-start justify-between gap-4">
      <div>
        <p class="text-eyebrow text-slate-400">
          {m.dashboard_balance_title()} · {activePeriodLabel}
        </p>
        <p class="mt-1 text-xs text-slate-400">{m.dashboard_balance_ledger_note()}</p>
      </div>
      <a href={transactionsHref()} class="text-accent shrink-0 text-xs font-medium hover:underline">
        {m.dashboard_balance_all_link()} →
      </a>
    </div>

    {#if summary}
      <p
        class={cn(
          "text-display relative mt-3 font-semibold tabular-nums",
          summary.net >= 0 ? "text-accent-gradient" : "text-rose-400"
        )}
      >
        {formatCurrency(summary.net)}
      </p>
      {#if showForecastNote && forecastSummary}
        <p class="relative mt-2 text-xs text-slate-400">
          {m.summary_forecast_note()}: {formatCurrency(forecastSummary.net)}
        </p>
      {/if}

      <div class="relative mt-5 grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
        <a
          href={transactionsHref({ type: "income" })}
          class="focus-visible:ring-accent min-w-0 rounded-xl px-1 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        >
          <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
          <p class="mt-1 truncate text-base font-semibold text-emerald-300 tabular-nums sm:text-lg">
            {formatCurrency(summary.total_income)}
          </p>
        </a>
        <a
          href={transactionsHref({ type: "expense" })}
          class="focus-visible:ring-accent min-w-0 rounded-xl px-1 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        >
          <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
          <p class="mt-1 truncate text-base font-semibold text-rose-300 tabular-nums sm:text-lg">
            {formatCurrency(summary.total_expenses)}
          </p>
        </a>
        <div class="min-w-0 px-1">
          <p class="text-eyebrow text-slate-400">{m.summary_savings_ratio()}</p>
          <p
            class={cn(
              "mt-1 font-semibold tabular-nums",
              savingsRatio === null
                ? "text-sm text-slate-400"
                : savingsRatio >= 0
                  ? "text-base text-emerald-300 sm:text-lg"
                  : "text-base text-rose-300 sm:text-lg"
            )}
          >
            {savingsRatio === null ? m.dashboard_savings_na() : `${savingsRatio}%`}
          </p>
        </div>
      </div>
    {:else}
      <div class="relative mt-3 h-14 w-2/3 animate-pulse rounded-lg bg-slate-800/60"></div>
    {/if}
  </section>

  <DashboardSpendingInsight
    insight={spendingInsight}
    {period}
    categoryHref={(id) => (id ? transactionsHref({ categoryId: id }) : transactionsHref())}
  />

  <!-- Multi-period spend comparison (last 6 weeks/months/years) -->
  <div class="mt-4">
    <SpendHistoryChart buckets={historyBuckets} onselectperiod={selectHistoryPeriod} />
  </div>

  <!-- Status band -->
  <section class="mt-6">
    <h2 class="mb-2 text-sm font-medium text-slate-400">{m.dashboard_status_band()}</h2>
    <div class="grid gap-3 sm:grid-cols-2">
      <DashboardAttention {userId} {overdueCount} />
      <DashboardImportHealth />
      <DashboardNetWorthStrip />
      <DashboardPlanProgress />
    </div>
  </section>

  <!-- Upcoming / overdue -->
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-eyebrow text-slate-400">{m.dashboard_upcoming_title()}</p>
      {#if upcomingTxs.length > 0}
        <a
          href={transactionsHref({ status: "upcoming,overdue" })}
          class="text-accent hover:text-accent text-xs font-medium"
        >
          {m.dashboard_upcoming_see_all()}
        </a>
      {/if}
    </div>

    {#if txQuery.isPending}
      <div class="space-y-2">
        {#each Array(3) as _, i (i)}
          <div class="h-14 animate-pulse rounded-xl border border-white/5 bg-slate-900/60"></div>
        {/each}
      </div>
    {:else if txQuery.isError}
      <p class="py-6 text-center text-sm text-rose-300">{m.common_error_title()}</p>
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
