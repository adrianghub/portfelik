<script lang="ts">
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import { formatCurrency, cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";
  import SpendingTreemap, {
    type TreemapCategory,
  } from "$lib/components/dashboard/charts/SpendingTreemap.svelte";

  let { insight, period }: { insight: SpendingInsight; period: "week" | "month" | "year" } =
    $props();

  // Cap the treemap so tiny slivers stay legible; fold the tail into "Inne".
  const TREEMAP_TOP = 7;
  const treemapCategories = $derived.by<TreemapCategory[]>(() => {
    const cats = insight.categories.filter((c) => c.total > 0);
    const toTile = (c: (typeof cats)[number]): TreemapCategory => ({
      categoryId: c.categoryId,
      name: c.name,
      total: c.total,
      deltaPct: insight.isFirstPeriod ? null : c.deltaPct,
    });
    if (cats.length <= TREEMAP_TOP) return cats.map(toTile);
    const top = cats.slice(0, TREEMAP_TOP).map(toTile);
    const restTotal = cats.slice(TREEMAP_TOP).reduce((s, c) => s + c.total, 0);
    if (restTotal > 0) {
      top.push({ categoryId: null, name: "Inne", total: restTotal, deltaPct: null });
    }
    return top;
  });

  const vsPrevLabel = $derived(
    period === "week"
      ? m.dashboard_spending_vs_prev_week()
      : period === "year"
        ? m.dashboard_spending_vs_prev_year()
        : m.dashboard_spending_vs_prev_month()
  );
  function deltaLabel(pct: number | null): string {
    if (pct === null) return "";
    const arrow = pct >= 0 ? "↑" : "↓";
    return `${arrow}${Math.abs(Math.round(pct))}%`;
  }
  function expenseLabel(e: (typeof insight.biggestExpenses)[number]): string {
    const cat = e.categoryName?.trim();
    if (cat) return cat;
    const desc = e.description.trim();
    return desc.length > 28 ? `${desc.slice(0, 28).trimEnd()}…` : desc;
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
          {vsPrevLabel}
        </span>
      {/if}
    </p>

    {#if treemapCategories.length > 0}
      <div class="mt-3">
        <SpendingTreemap categories={treemapCategories} />
      </div>
    {/if}

    {#if insight.biggestExpenses.length > 0}
      <p class="mt-3 text-xs text-slate-400">
        {m.dashboard_spending_biggest()}:
        {#each insight.biggestExpenses as e, i (e.id)}{i > 0 ? " · " : " "}{expenseLabel(e)}
          {formatCurrency(e.amount)}{/each}
      </p>
    {/if}

    {#if insight.isFirstPeriod}
      <p class="mt-2 text-xs text-slate-500">{m.dashboard_spending_first_period()}</p>
    {/if}
  {/if}
</section>
