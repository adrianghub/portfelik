<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    collectNetWorthDebtBalances,
    computeNetWorth,
    fetchFinancialSnapshot,
  } from "$lib/services/financial-snapshots";
  import { fetchNetWorthItems } from "$lib/services/net-worth-items";
  import { convertToPln, fetchPlnRates } from "$lib/services/fx";
  import { fetchPlanDebtTermsByPlanIds } from "$lib/services/plan-debt";
  import { fetchPlanProgressForPlans } from "$lib/services/plan-settlement";
  import { fetchPlans, todayIso } from "$lib/services/plans";
  import { fetchPrivateCashPosition, livePosition } from "$lib/services/cash-position";
  import { fetchTransactions } from "$lib/services/transactions";
  import { createQuery } from "@tanstack/svelte-query";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { ChevronRight, Wallet } from "lucide-svelte";

  const plansQuery = createQuery(() => ({
    queryKey: ["plans"],
    queryFn: fetchPlans,
  }));

  const debtPlanIds = $derived(
    (plansQuery.data ?? []).filter((plan) => plan.kind === "debt").map((plan) => plan.id)
  );

  const debtTermsQuery = createQuery(() => ({
    queryKey: ["plan-debt-terms-list", debtPlanIds],
    queryFn: () => fetchPlanDebtTermsByPlanIds(debtPlanIds),
    enabled: debtPlanIds.length > 0,
  }));

  const debtProgressQuery = createQuery(() => ({
    queryKey: ["plan-progress-list", debtPlanIds],
    queryFn: () => fetchPlanProgressForPlans(debtPlanIds),
    enabled: debtPlanIds.length > 0,
  }));

  const snapshotQuery = createQuery(() => ({
    queryKey: ["financial-snapshot"],
    queryFn: fetchFinancialSnapshot,
  }));

  const itemsQuery = createQuery(() => ({
    queryKey: ["net-worth-items"],
    queryFn: fetchNetWorthItems,
  }));

  const fxQuery = createQuery(() => ({
    queryKey: ["fx", "nbp-table-a"],
    queryFn: fetchPlnRates,
    staleTime: 12 * 60 * 60 * 1000,
  }));

  const valuedItems = $derived(
    (itemsQuery.data ?? []).map((it) => ({
      label: it.label,
      currency: it.currency,
      amount: it.amount,
      amountPln: convertToPln(it.amount, it.currency, fxQuery.data ?? { PLN: 1 }),
    }))
  );

  const cashPositionQuery = createQuery(() => ({
    queryKey: ["cash-position"],
    queryFn: fetchPrivateCashPosition,
  }));

  const cashRangeStart = $derived(cashPositionQuery.data?.as_of_date ?? "2000-01-01");
  const CASH_RANGE_END = "9999-12-31";
  const positionTxQuery = createQuery(() => ({
    queryKey: ["transactions", "cash-position-range", cashRangeStart],
    queryFn: () => fetchTransactions(cashRangeStart, CASH_RANGE_END),
    enabled: cashPositionQuery.isSuccess,
  }));

  const derivedCash = $derived(
    livePosition(
      cashPositionQuery.data ?? null,
      (positionTxQuery.data ?? [])
        .filter((t) => (t.group_id ?? null) === null)
        .map((t) => ({ type: t.type, amount: t.amount, status: t.status, date: t.date }))
    )
  );

  const linkedExpensesByPlanId = $derived(
    Object.fromEntries(
      Object.entries(debtProgressQuery.data ?? {}).map(([planId, p]) => [planId, p.linkedExpenses])
    )
  );

  const netWorth = $derived(
    computeNetWorth({
      asOfDate: snapshotQuery.data?.as_of_date ?? null,
      items: valuedItems,
      derivedCash,
      debtBalances: collectNetWorthDebtBalances(
        plansQuery.data ?? [],
        debtTermsQuery.data ?? {},
        todayIso(),
        linkedExpensesByPlanId
      ),
    })
  );

  const loading = $derived(snapshotQuery.isPending || plansQuery.isPending);
</script>

<section
  class="min-w-0 rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
  aria-labelledby="dashboard-net-worth-title"
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <p id="dashboard-net-worth-title" class="text-eyebrow text-slate-400">
        {m.dashboard_net_worth_title()}
      </p>
      {#if loading}
        <div class="mt-2 h-7 w-36 animate-pulse rounded bg-slate-800/60"></div>
      {:else if !netWorth.hasData && !cashPositionQuery.data}
        <p class="mt-1.5 text-sm text-slate-400">{m.dashboard_net_worth_empty()}</p>
      {:else}
        <p
          class={cn(
            "mt-1.5 text-xl font-semibold tracking-tight break-words tabular-nums sm:text-2xl",
            netWorth.netWorth >= 0 ? "text-accent" : "text-rose-400"
          )}
        >
          {formatCurrency(netWorth.netWorth)}
        </p>
        <p class="mt-0.5 text-xs text-slate-500">
          {#if netWorth.asOfDate}
            {m.dashboard_net_worth_subtitle_dated({ date: formatDate(netWorth.asOfDate) })}
          {:else}
            {m.dashboard_net_worth_subtitle_today()}
          {/if}
        </p>
        <dl class="mt-2 space-y-1.5 text-xs">
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 text-slate-500">{m.dashboard_net_worth_assets_label()}</dt>
            <dd class="min-w-0 text-right font-medium text-slate-300 tabular-nums">
              {formatCurrency(netWorth.totalAssets)}
            </dd>
          </div>
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 text-slate-500">{m.dashboard_net_worth_debt_label()}</dt>
            <dd class="min-w-0 text-right font-medium text-slate-300 tabular-nums">
              {formatCurrency(netWorth.totalDebt)}
            </dd>
          </div>
        </dl>
      {/if}
    </div>
    <Wallet size={18} class="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
  </div>

  <a
    href="/plans"
    class="focus-visible:ring-accent mt-3 inline-flex max-w-full items-center gap-1 text-sm font-semibold text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.dashboard_net_worth_link()}
    <ChevronRight size={14} aria-hidden="true" />
  </a>
</section>
