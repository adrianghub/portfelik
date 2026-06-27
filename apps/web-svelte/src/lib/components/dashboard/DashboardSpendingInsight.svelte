<script lang="ts">
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import { formatCurrency, cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";
  import SpendingTreemap, {
    type TreemapCategory,
  } from "$lib/components/dashboard/charts/SpendingTreemap.svelte";

  let {
    insight,
    period,
    categoryHref,
  }: {
    insight: SpendingInsight;
    period: "week" | "month" | "year";
    /** Period-aware transactions link for a treemap tile (null = all). */
    categoryHref: (categoryId: string | null) => string;
  } = $props();

  const treemapCategories = $derived.by<TreemapCategory[]>(() =>
    insight.categories
      .filter((c) => c.total > 0)
      .map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        total: c.total,
        deltaPct: insight.isFirstPeriod ? null : c.deltaPct,
      }))
  );

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

  // Biggest movers vs the previous period — already computed by computeSpendingInsight,
  // just unsurfaced. Drop sub-floor noise and the first period (nothing to compare).
  const movers = $derived(
    insight.isFirstPeriod
      ? []
      : insight.biggestMovers.filter((c) => Math.abs(c.deltaAbs) >= 50).slice(0, 3)
  );
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
        <SpendingTreemap categories={treemapCategories} {categoryHref} />
      </div>
    {/if}

    {#if movers.length > 0}
      <div class="mt-3">
        <p class="text-eyebrow text-slate-400">{m.dashboard_spending_movers()}</p>
        <ul class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {#each movers as mv (mv.categoryId)}
            <li class="text-slate-300">
              {mv.name}
              <span
                class={cn("tabular-nums", mv.deltaAbs >= 0 ? "text-rose-400" : "text-emerald-400")}
              >
                {mv.deltaAbs >= 0 ? "+" : "−"}{formatCurrency(Math.abs(mv.deltaAbs))}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if insight.isFirstPeriod}
      <p class="mt-2 text-xs text-slate-400">{m.dashboard_spending_first_period()}</p>
    {/if}
  {/if}
</section>
