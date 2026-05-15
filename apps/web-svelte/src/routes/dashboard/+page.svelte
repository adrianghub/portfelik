<script lang="ts">
  import { goto } from "$app/navigation";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchShoppingLists } from "$lib/services/shopping-lists";
  import { computeSummary, fetchTransactions } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import type { TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, getDateRangeBounds } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { CheckCircle2, Plus, ShoppingCart } from "lucide-svelte";

  type Period = "week" | "month" | "year";
  let period = $state<Period>("month");

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
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
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
    const endMs = new Date(bounds.end).getTime() + 86_400_000 - 1;
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

  const listsQuery = createQuery(() => ({
    queryKey: ["shopping_lists"],
    queryFn: fetchShoppingLists,
  }));
  const monthlyWins = $derived.by(() => {
    if (!listsQuery.data) return null;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const completedThisMonth = listsQuery.data.filter(
      (l) =>
        l.status === "completed" &&
        l.completed_at &&
        new Date(l.completed_at) >= monthStart &&
        new Date(l.completed_at) < monthEnd
    );
    if (completedThisMonth.length === 0) return null;
    return {
      listsCompleted: completedThisMonth.length,
      itemsChecked: completedThisMonth.reduce((sum, l) => sum + l.item_completed, 0),
    };
  });

  const upcomingTxs = $derived(
    txQuery.data?.filter((tx) => tx.status === "upcoming" || tx.status === "overdue").slice(0, 5) ??
      []
  );

  function openTransaction(tx: TransactionWithCategory) {
    goto(`/transactions?status=${tx.status}`);
  }

  const periodChips: { value: Period; label: string }[] = $derived([
    { value: "week", label: m.dashboard_period_week() },
    { value: "month", label: m.dashboard_period_month() },
    { value: "year", label: m.dashboard_period_year() },
  ]);
  const activePeriodLabel = $derived(periodChips.find((c) => c.value === period)?.label ?? "");
</script>

<div class="container mx-auto max-w-4xl space-y-5 px-4 py-6">
  <!-- Header — mobile (single line) -->
  <div class="flex items-center justify-between gap-3 md:hidden">
    <p class="truncate text-base font-medium text-slate-100">
      {#if profileQuery.data}
        {m.transactions_greeting({
          name: profileQuery.data.name ?? profileQuery.data.email,
        })}
      {:else}
        &nbsp;
      {/if}
    </p>
  </div>

  <!-- Header — desktop -->
  <div class="hidden items-center justify-between md:flex">
    <div>
      {#if profileQuery.data}
        <p class="mb-0.5 text-base text-slate-400">
          {m.transactions_greeting({ name: profileQuery.data.name ?? profileQuery.data.email })}
        </p>
      {/if}
      <h1 class="text-hero font-semibold text-slate-100">
        {m.dashboard_title()}
      </h1>
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
  <section
    class="relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur"
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
  </section>

  <!-- Stat row with sparklines -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <!-- Income -->
    <article
      class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
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
    </article>

    <!-- Expenses -->
    <article
      class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
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
    </article>

    <!-- Savings ratio -->
    <article
      class="relative col-span-2 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur sm:col-span-1"
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
    </article>
  </div>

  <!-- Monthly wins -->
  {#if monthlyWins}
    <section
      class="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 backdrop-blur"
    >
      <span class="glow-disc absolute -top-8 -right-8 h-32 w-32" aria-hidden="true"></span>
      <p class="text-eyebrow relative text-emerald-300">{m.dashboard_wins_title()}</p>
      <div
        class="relative mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-base font-semibold text-emerald-100"
      >
        <span class="flex items-center gap-2">
          <ShoppingCart size={18} strokeWidth={1.8} aria-hidden="true" />
          {m.dashboard_wins_lists({ count: monthlyWins.listsCompleted })}
        </span>
        <span class="flex items-center gap-2">
          <CheckCircle2 size={18} strokeWidth={1.8} aria-hidden="true" />
          {m.dashboard_wins_items({ count: monthlyWins.itemsChecked })}
        </span>
      </div>
    </section>
  {/if}

  <!-- Upcoming / overdue -->
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-eyebrow text-slate-400">{m.dashboard_upcoming_title()}</p>
      {#if upcomingTxs.length > 0}
        <a
          href="/transactions?status=upcoming,overdue"
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

<!-- Mobile floating FAB (above pill bottom nav) -->
<button
  type="button"
  onclick={() => goto("/transactions")}
  aria-label={m.transaction_add()}
  class="bg-accent-gradient fixed right-4 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full text-slate-900 shadow-[0_0_24px_var(--color-accent-glow)] transition-transform active:scale-95 md:hidden"
  style="margin-bottom: env(safe-area-inset-bottom);"
>
  <Plus size={24} strokeWidth={2.5} aria-hidden="true" />
</button>
