<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import DashboardImportHealth from "$lib/components/dashboard/DashboardImportHealth.svelte";
  import DashboardNetWorthStrip from "$lib/components/dashboard/DashboardNetWorthStrip.svelte";
  import DashboardPlanProgress from "$lib/components/dashboard/DashboardPlanProgress.svelte";
  import CategoryBreakdown from "$lib/components/transactions/CategoryBreakdown.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchMyGroupRoles, fetchUserGroups } from "$lib/services/groups";
  import {
    computeForecastSummary,
    computeLedgerSummary,
    ledgerTransactions,
  } from "$lib/services/transaction-cashflow";
  import { fetchTransactions, updateTransactionsStatus } from "$lib/services/transactions";
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

  let userId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id ?? null;
  });

  const queryClient = useQueryClient();

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["group_roles"],
    queryFn: fetchMyGroupRoles,
    enabled: !!userId,
  }));

  function dashCanManage(tx: TransactionWithCategory): boolean {
    if (!userId) return false;
    return canManageTransaction(tx, userId, groupRolesQuery.data ?? new Map());
  }

  const settleMutation = createMutation(() => ({
    mutationFn: (vars: { id: string; prev: TransactionStatus }) =>
      updateTransactionsStatus([vars.id], "paid"),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transaction_settled(), {
        action: {
          label: m.toast_transaction_settle_undo(),
          onClick: () => {
            void updateTransactionsStatus([vars.id], vars.prev).then(() =>
              queryClient.invalidateQueries({ queryKey: ["transactions"] })
            );
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

  const series = $derived.by(() => {
    const inc = new Array<number>(bounds.buckets).fill(0);
    const exp = new Array<number>(bounds.buckets).fill(0);
    const ledger = ledgerTransactions(scopedTxs);
    if (ledger.length === 0) return { income: inc, expense: exp };
    const startMs = new Date(bounds.start).getTime();
    const endMs = new Date(bounds.end).getTime() - 1;
    for (const tx of ledger) {
      const t = new Date(tx.date).getTime();
      if (t < startMs || t > endMs) continue;
      let idx: number;
      if (period === "year") {
        idx = new Date(tx.date).getMonth();
      } else {
        idx = Math.floor((t - startMs) / 86_400_000);
      }
      if (idx < 0 || idx >= bounds.buckets) continue;
      const amount = Math.abs(Number(tx.amount));
      if (tx.type === "income") inc[idx] += amount;
      else exp[idx] += amount;
    }
    return { income: inc, expense: exp };
  });

  function sparklinePath(values: number[]): string {
    if (values.length < 2) return "";
    const max = Math.max(...values, 1);
    const w = 100;
    const h = 24;
    const step = w / (values.length - 1);
    return values
      .map((v, i) => {
        const x = (i * step).toFixed(2);
        const y = (h - (v / max) * h).toFixed(2);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  const incomePath = $derived(sparklinePath(series.income));
  const expensePath = $derived(sparklinePath(series.expense));
  const savingsPath = $derived(sparklinePath(series.income.map((v, i) => v - series.expense[i])));

  const savingsRatio = $derived.by(() => {
    if (!summary) return null;
    if (summary.total_income <= 0) return null;
    return Math.round((summary.net / summary.total_income) * 100);
  });

  const upcomingTxs = $derived(
    scopedTxs.filter((tx) => tx.status === "upcoming" || tx.status === "overdue").slice(0, 5)
  );

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

  <DashboardImportHealth />
  <DashboardNetWorthStrip />
  <DashboardPlanProgress />

  {#if (groupsQuery.data?.length ?? 0) > 0}
    <div role="tablist" aria-label={m.dashboard_scope_all()} class="flex flex-wrap gap-1">
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

  <!-- Hero balance card -->
  <a
    href={transactionsHref()}
    class="relative block overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur transition-colors hover:bg-white/5"
  >
    <span class="glow-disc absolute -top-12 -right-12 h-40 w-40" aria-hidden="true"></span>
    <p class="text-eyebrow text-slate-400">
      {m.dashboard_balance_title()} · {activePeriodLabel}
    </p>
    <p class="mt-1 text-xs text-slate-400">{m.dashboard_balance_ledger_note()}</p>
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
    {:else}
      <div class="mt-3 h-14 w-2/3 animate-pulse rounded-lg bg-slate-800/60"></div>
    {/if}
  </a>

  <!-- Stat row with sparklines -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <!-- Income -->
    <a
      href={transactionsHref({ type: "income" })}
      class="focus-visible:ring-accent relative block overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
      {#if summary}
        <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
          {formatCurrency(summary.total_income)}
        </p>
      {:else}
        <div class="mt-1.5 h-6 w-2/3 animate-pulse rounded bg-slate-800/60"></div>
      {/if}
      <svg
        class="mt-3 h-6 w-full text-emerald-400/70"
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#if incomePath}
          <path
            d={incomePath}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        {/if}
      </svg>
    </a>

    <!-- Expenses -->
    <a
      href={transactionsHref({ type: "expense" })}
      class="focus-visible:ring-accent relative block overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
      {#if summary}
        <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
          {formatCurrency(summary.total_expenses)}
        </p>
      {:else}
        <div class="mt-1.5 h-6 w-2/3 animate-pulse rounded bg-slate-800/60"></div>
      {/if}
      <svg
        class="mt-3 h-6 w-full text-rose-400/70"
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#if expensePath}
          <path
            d={expensePath}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        {/if}
      </svg>
    </a>

    <!-- Savings ratio -->
    <a
      href={transactionsHref()}
      class="focus-visible:ring-accent relative col-span-2 block overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none sm:col-span-1"
    >
      <p class="text-eyebrow text-slate-400">{m.summary_savings_ratio()}</p>
      {#if summary}
        <p
          class={cn(
            "mt-1.5 text-lg font-semibold tabular-nums",
            savingsRatio === null
              ? "text-slate-400"
              : savingsRatio >= 0
                ? "text-emerald-300"
                : "text-rose-300"
          )}
        >
          {savingsRatio === null ? "-" : `${savingsRatio}%`}
        </p>
      {:else}
        <div class="mt-1.5 h-6 w-1/2 animate-pulse rounded bg-slate-800/60"></div>
      {/if}
      <svg
        class="mt-3 h-6 w-full text-slate-300/60"
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#if savingsPath}
          <path
            d={savingsPath}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        {/if}
      </svg>
    </a>
  </div>

  {#if summary && summary.categories.length > 0}
    <CategoryBreakdown
      categories={summary.categories}
      oncategoryclick={(categoryId) => goto(transactionsHref({ categoryId }))}
    />
  {/if}

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
