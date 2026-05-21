<script lang="ts">
  import { goto } from "$app/navigation";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchProfile } from "$lib/services/profiles";
  import { computeSummary, fetchTransactions } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import type { TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, getDateRangeBounds } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { ListChecks, Target, TrendingDown } from "lucide-svelte";
  import { dailyGreeting, dailyQuote } from "$lib/dashboard-daily";

  const greeting = dailyGreeting();
  const quote = dailyQuote();

  type Period = "week" | "month" | "year";
  let period = $state<Period>("month");

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

  const txQuery = createQuery(() => ({
    queryKey: ["transactions", "dashboard", period, bounds.start, bounds.end] as const,
    queryFn: () => fetchTransactions(bounds.start, bounds.end),
  }));

  const summary = $derived(txQuery.data ? computeSummary(txQuery.data) : null);

  const series = $derived.by(() => {
    const inc = new Array<number>(bounds.buckets).fill(0);
    const exp = new Array<number>(bounds.buckets).fill(0);
    if (!txQuery.data) return { income: inc, expense: exp };
    const startMs = new Date(bounds.start).getTime();
    const endMs = new Date(bounds.end).getTime() - 1;
    for (const tx of txQuery.data) {
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

  const periodStats = $derived.by(() => {
    const txs = txQuery.data ?? [];
    const incomeTxs = txs.filter((tx) => tx.type === "income");
    const expenseTxs = txs.filter((tx) => tx.type === "expense");
    const topCategory = summary?.categories[0] ?? null;
    const reduceTopByTen = topCategory ? topCategory.total * 0.1 : 0;

    return {
      incomeCount: incomeTxs.length,
      expenseCount: expenseTxs.length,
      totalCount: txs.length,
      topCategory,
      mission:
        txs.length === 0
          ? m.dashboard_insights_mission_import()
          : summary && summary.total_income === 0 && summary.total_expenses > 0
            ? m.dashboard_insights_mission_income()
            : summary && summary.net < 0 && topCategory
              ? m.dashboard_insights_mission_reduce_category({
                  category: topCategory.category_name,
                  amount: formatCurrency(reduceTopByTen),
                })
              : savingsRatio !== null && savingsRatio >= 20
                ? m.dashboard_insights_mission_keep()
                : savingsRatio !== null && summary
                  ? m.dashboard_insights_mission_savings({
                      amount: formatCurrency(Math.max(0, summary.total_income * 0.2 - summary.net)),
                    })
                  : m.dashboard_insights_mission_review(),
    };
  });

  const upcomingTxs = $derived(
    txQuery.data?.filter((tx) => tx.status === "upcoming" || tx.status === "overdue").slice(0, 5) ??
      []
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

<div class="container mx-auto max-w-4xl space-y-5 px-4 py-6">
  <!-- Header — mobile (single line greeting + quote underneath) -->
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

  <!-- Header — desktop -->
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
        onclick={() => (period = chip.value)}
        class={cn(
          "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
          period === chip.value
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {chip.label}
      </button>
    {/each}
  </div>

  <!-- Hero balance card -->
  <a
    href={transactionsHref()}
    class="relative block overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur transition-colors hover:bg-white/5"
  >
    <span class="glow-disc absolute -top-12 -right-12 h-40 w-40" aria-hidden="true"></span>
    <p class="text-eyebrow text-slate-400">
      {m.dashboard_balance_title()} · {activePeriodLabel}
    </p>
    {#if summary}
      <p
        class={cn(
          "text-display relative mt-3 font-semibold tabular-nums",
          summary.net >= 0 ? "text-accent-gradient" : "text-rose-400"
        )}
      >
        {formatCurrency(summary.net)}
      </p>
    {:else}
      <div class="mt-3 h-14 w-2/3 animate-pulse rounded-lg bg-slate-800/60"></div>
    {/if}
  </a>

  <!-- Stat row with sparklines -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <!-- Income -->
    <a
      href={transactionsHref({ type: "income" })}
      class="relative block overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
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
      class="relative block overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
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
      class="relative col-span-2 block overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none sm:col-span-1"
    >
      <p class="text-eyebrow text-slate-400">{m.summary_savings_ratio()}</p>
      {#if summary}
        <p
          class={cn(
            "mt-1.5 text-lg font-semibold tabular-nums",
            savingsRatio === null
              ? "text-slate-500"
              : savingsRatio >= 0
                ? "text-emerald-300"
                : "text-rose-300"
          )}
        >
          {savingsRatio === null ? "—" : `${savingsRatio}%`}
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

  <!-- Period insights -->
  <section
    class="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 backdrop-blur"
  >
    <span class="glow-disc absolute -top-8 -right-8 h-32 w-32" aria-hidden="true"></span>
    <div class="relative flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-eyebrow text-emerald-300">{m.dashboard_insights_title()}</p>
        <p class="mt-1 text-xs text-slate-400">
          {m.dashboard_insights_period({ period: activePeriodLabel })}
        </p>
      </div>
      <a
        href={transactionsHref()}
        class="rounded-full border border-emerald-400/20 px-3 py-1 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-400/10"
      >
        {m.dashboard_insights_open_transactions()}
      </a>
    </div>

    <div class="relative mt-4 grid gap-3 md:grid-cols-3">
      <div class="rounded-xl border border-white/10 bg-slate-950/30 p-3">
        <div class="flex items-center gap-2 text-slate-400">
          <ListChecks size={16} strokeWidth={1.8} aria-hidden="true" />
          <p class="text-eyebrow">{m.dashboard_insights_activity_title()}</p>
        </div>
        <p class="mt-2 text-sm font-semibold text-slate-100">
          {m.dashboard_insights_activity_total({ count: periodStats.totalCount })}
        </p>
        <p class="mt-1 text-xs text-slate-400">
          {m.dashboard_insights_activity_split({
            income: periodStats.incomeCount,
            expense: periodStats.expenseCount,
          })}
        </p>
      </div>

      <a
        href={periodStats.topCategory
          ? transactionsHref({ type: "expense", categoryId: periodStats.topCategory.category_id })
          : transactionsHref({ type: "expense" })}
        class="rounded-xl border border-white/10 bg-slate-950/30 p-3 transition-colors hover:bg-white/5"
      >
        <div class="flex items-center gap-2 text-slate-400">
          <TrendingDown size={16} strokeWidth={1.8} aria-hidden="true" />
          <p class="text-eyebrow">{m.dashboard_insights_top_category_title()}</p>
        </div>
        {#if periodStats.topCategory}
          <p class="mt-2 truncate text-sm font-semibold text-slate-100">
            {periodStats.topCategory.category_name}
          </p>
          <p class="mt-1 text-xs text-slate-400">
            {m.dashboard_insights_top_category_value({
              amount: formatCurrency(periodStats.topCategory.total),
              percent: periodStats.topCategory.percentage,
            })}
          </p>
        {:else}
          <p class="mt-2 text-sm font-semibold text-slate-500">
            {m.dashboard_insights_no_expenses()}
          </p>
        {/if}
      </a>

      <div class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
        <div class="flex items-center gap-2 text-emerald-300">
          <Target size={16} strokeWidth={1.8} aria-hidden="true" />
          <p class="text-eyebrow">{m.dashboard_insights_mission_title()}</p>
        </div>
        <p class="mt-2 text-sm leading-relaxed font-semibold text-emerald-50">
          {periodStats.mission}
        </p>
      </div>
    </div>
  </section>

  <!-- Upcoming / overdue -->
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-eyebrow text-slate-400">{m.dashboard_upcoming_title()}</p>
      {#if upcomingTxs.length > 0}
        <a
          href={transactionsHref({ status: "upcoming,overdue" })}
          class="text-xs font-medium text-emerald-300 hover:text-emerald-200"
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
      <p class="py-6 text-center text-sm text-slate-500">
        {m.dashboard_empty_upcoming()}
      </p>
    {:else}
      <TransactionTable
        transactions={upcomingTxs}
        selectedIds={new Set()}
        onrowclick={openTransaction}
      />
    {/if}
  </div>
</div>
