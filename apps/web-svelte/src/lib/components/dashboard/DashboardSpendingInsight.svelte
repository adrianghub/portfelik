<script lang="ts">
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import { formatDeltaPct, isSignificantDeltaPct } from "$lib/services/spending-category-display";
  import SpendingCategoryBreakdown from "$lib/components/dashboard/SpendingCategoryBreakdown.svelte";
  import { formatCurrency, cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";
  import { ChevronDown } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";

  let {
    insight,
    period,
    categoryHref,
    expanded = $bindable(untrack(() => isDesktop.current)),
  }: {
    insight: SpendingInsight;
    period: "week" | "month" | "year";
    categoryHref: (categoryId: string | null) => string;
    expanded?: boolean;
  } = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");

  const vsPrevLabel = $derived(
    period === "week"
      ? m.dashboard_spending_vs_prev_week()
      : period === "year"
        ? m.dashboard_spending_vs_prev_year()
        : m.dashboard_spending_vs_prev_month()
  );
</script>

<section
  id="dashboard-spending"
  class="min-w-0 overflow-x-clip rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
>
  <button
    type="button"
    class="flex w-full items-baseline justify-between gap-3"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <h2 class="text-sm font-medium text-slate-400">{m.dashboard_spending_title()}</h2>
    <span class="flex shrink-0 items-center gap-2">
      {#if insight.spent > 0 || insight.categories.length > 0}
        <span class="text-sm font-semibold text-slate-200 tabular-nums">
          {formatCurrency(insight.spent)}
        </span>
      {/if}
      <ChevronDown
        size={17}
        strokeWidth={1.8}
        class={cn(
          "text-slate-400 transition-transform duration-300 ease-out",
          expanded && "rotate-180"
        )}
        aria-hidden="true"
      />
    </span>
  </button>

  <div class={cn("expand-grid", expanded && "expand-grid--open")} aria-hidden={!expanded}>
    <div class="expand-grid-inner">
      <div class="expand-grid-panel">
        {#if insight.spent === 0 && insight.categories.length === 0}
          <p class="pt-2 text-sm text-slate-400">{m.dashboard_spending_empty()}</p>
        {:else}
          {#if !insight.isFirstPeriod && isSignificantDeltaPct(insight.spentDeltaPct)}
            <p
              class={cn(
                "pt-2 text-sm",
                insight.spentDeltaPct >= 0 ? "text-rose-400" : "text-emerald-400"
              )}
            >
              {formatDeltaPct(insight.spentDeltaPct)}
              {vsPrevLabel}
            </p>
          {/if}

          <SpendingCategoryBreakdown
            categories={insight.categories}
            biggestMovers={insight.biggestMovers}
            spent={insight.spent}
            isFirstPeriod={insight.isFirstPeriod}
            categoryHref={(id) => categoryHref(id)}
          />

          {#if insight.isFirstPeriod}
            <p class="mt-2 text-xs text-slate-400">{m.dashboard_spending_first_period()}</p>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</section>
