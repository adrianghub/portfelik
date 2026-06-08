<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    collectNetWorthDebtBalances,
    computeNetWorth,
    fetchFinancialSnapshot,
  } from "$lib/services/financial-snapshots";
  import { fetchPlanDebtTermsByPlanIds } from "$lib/services/plan-debt";
  import { fetchPlans } from "$lib/services/plans";
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

  const snapshotQuery = createQuery(() => ({
    queryKey: ["financial-snapshot"],
    queryFn: fetchFinancialSnapshot,
  }));

  const netWorthAsOf = $derived(
    snapshotQuery.data?.as_of_date ?? new Date().toISOString().slice(0, 10)
  );

  const netWorth = $derived(
    computeNetWorth(
      snapshotQuery.data ?? null,
      collectNetWorthDebtBalances(plansQuery.data ?? [], debtTermsQuery.data ?? {}, netWorthAsOf)
    )
  );

  const loading = $derived(snapshotQuery.isPending || plansQuery.isPending);
</script>

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
  aria-labelledby="dashboard-net-worth-title"
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p id="dashboard-net-worth-title" class="text-eyebrow text-slate-400">
        {m.dashboard_net_worth_title()}
      </p>
      {#if loading}
        <div class="mt-3 h-8 w-40 animate-pulse rounded-lg bg-slate-800/60"></div>
      {:else if !netWorth.hasSnapshot}
        <p class="mt-2 text-sm text-slate-400">{m.dashboard_net_worth_empty()}</p>
      {:else}
        <p
          class={cn(
            "mt-2 text-2xl font-semibold tabular-nums",
            netWorth.netWorth >= 0 ? "text-accent" : "text-rose-400"
          )}
        >
          {formatCurrency(netWorth.netWorth)}
        </p>
        <p class="mt-1 text-xs text-slate-500">
          {m.dashboard_net_worth_subtitle({
            date: netWorth.asOfDate ? formatDate(netWorth.asOfDate) : "-",
          })}
        </p>
        <p class="mt-1 text-xs text-slate-500">{m.dashboard_net_worth_manual_note()}</p>
      {/if}
    </div>
    <Wallet size={18} class="shrink-0 text-slate-500" aria-hidden="true" />
  </div>
  <a
    href="/plans"
    class="focus-visible:ring-accent mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.dashboard_net_worth_link()}
    <ChevronRight size={14} aria-hidden="true" />
  </a>
</section>
