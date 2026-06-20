<script lang="ts">
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import { formatCurrency, cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  let { insight }: { insight: SpendingInsight } = $props();

  const topCategories = $derived(insight.categories.slice(0, 5));
  function deltaLabel(pct: number | null): string {
    if (pct === null) return "";
    const arrow = pct >= 0 ? "↑" : "↓";
    return `${arrow}${Math.abs(Math.round(pct))}%`;
  }
</script>

<section class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur">
  <h2 class="text-sm font-medium text-slate-400">{m.dashboard_spending_title()}</h2>

  {#if insight.spent === 0 && insight.categories.length === 0}
    <p class="mt-2 text-sm text-slate-400">{m.dashboard_spending_empty()}</p>
  {:else}
    <p class="mt-1 text-lg font-semibold">
      {m.dashboard_spending_spent()}
      {formatCurrency(insight.spent)}
      <span class="text-slate-400"
        >· {m.dashboard_spending_net()} {formatCurrency(insight.net)}</span
      >
      {#if !insight.isFirstPeriod && insight.spentDeltaPct !== null}
        <span
          class={cn("text-sm", insight.spentDeltaPct >= 0 ? "text-rose-400" : "text-emerald-400")}
        >
          {deltaLabel(insight.spentDeltaPct)}
          {m.dashboard_spending_vs_prev()}
        </span>
      {/if}
    </p>

    <ul class="mt-3 grid gap-2 sm:grid-cols-2">
      {#each topCategories as c (c.categoryId)}
        <li>
          <a
            href={`/transactions?categoryId=${c.categoryId}`}
            class="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 hover:bg-slate-800/60"
          >
            <span class="truncate">{c.name}</span>
            <span class="flex items-center gap-2">
              <span class="font-medium">{formatCurrency(c.total)}</span>
              {#if !insight.isFirstPeriod && c.deltaPct !== null}
                <span class={cn("text-xs", c.deltaPct >= 0 ? "text-rose-400" : "text-emerald-400")}>
                  {deltaLabel(c.deltaPct)}
                </span>
              {/if}
              {#if c.anomaly}
                <span class="text-xs text-amber-400" title={m.dashboard_spending_anomaly()}>⚠</span>
              {/if}
              {#if c.budgetUsedPct !== null}
                <span
                  class={cn("text-xs", c.budgetUsedPct > 100 ? "text-rose-400" : "text-slate-400")}
                >
                  {Math.round(c.budgetUsedPct)}% {m.dashboard_spending_budget_used()}
                </span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>

    {#if insight.biggestExpenses.length > 0}
      <p class="mt-3 text-xs text-slate-400">
        {m.dashboard_spending_biggest()}:
        {#each insight.biggestExpenses as e, i (e.id)}{i > 0 ? " · " : " "}{e.description}
          {formatCurrency(e.amount)}{/each}
      </p>
    {/if}

    {#if insight.isFirstPeriod}
      <p class="mt-2 text-xs text-slate-500">{m.dashboard_spending_first_period()}</p>
    {/if}
  {/if}
</section>
