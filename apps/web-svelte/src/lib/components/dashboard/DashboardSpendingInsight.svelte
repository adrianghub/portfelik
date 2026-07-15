<script lang="ts">
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import { formatDeltaPct, isSignificantDeltaPct } from "$lib/services/spending-category-display";
  import SpendingCategoryBreakdown from "$lib/components/dashboard/SpendingCategoryBreakdown.svelte";
  import { formatCurrency, cn } from "$lib/utils";
  import { guidedTourUi } from "$lib/guided-tour/ui.svelte";
  import * as m from "$lib/paraglide/messages";
  import { ChevronDown } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";

  let {
    insight,
    period,
    categoryHref,
    goalSplit = null,
    expanded = $bindable(false),
  }: {
    insight: SpendingInsight;
    period: "week" | "month" | "year" | "custom";
    categoryHref: (categoryId: string | null) => string;
    goalSplit?: {
      goalContributions: number;
      celeExpenses: number;
      otherExpenses: number;
      hasGoalActivity: boolean;
    } | null;
    expanded?: boolean;
  } = $props();

  const isMdLayout = new MediaQuery("(min-width: 768px)");

  const vsPrevLabel = $derived(
    period === "week"
      ? m.dashboard_spending_vs_prev_week()
      : period === "year"
        ? m.dashboard_spending_vs_prev_year()
        : period === "custom"
          ? m.dashboard_spending_vs_prev_period()
          : m.dashboard_spending_vs_prev_month()
  );

  const showContent = $derived(expanded || isMdLayout.current);
</script>

{#snippet spendingBody()}
  {#if insight.spent === 0 && insight.categories.length === 0}
    <p class="text-sm text-slate-400">{m.dashboard_spending_empty()}</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#if goalSplit?.hasGoalActivity}
        <div
          class="space-y-1 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-2 text-sm"
        >
          <p class="font-medium text-emerald-300 tabular-nums">
            {m.dashboard_spending_goal_slice({
              amount: formatCurrency(goalSplit.celeExpenses + goalSplit.goalContributions),
            })}
          </p>
          {#if goalSplit.goalContributions > 0}
            <p class="text-xs text-emerald-400/80 tabular-nums">
              {m.dashboard_spending_goal_income({
                amount: formatCurrency(goalSplit.goalContributions),
              })}
            </p>
          {/if}
          <p class="text-xs text-slate-400 tabular-nums">
            {m.dashboard_spending_other_expenses({
              amount: formatCurrency(goalSplit.otherExpenses),
            })}
          </p>
        </div>
      {/if}
      {#if !insight.isFirstPeriod && isSignificantDeltaPct(insight.spentDeltaPct)}
        <p class={cn("text-sm", insight.spentDeltaPct >= 0 ? "text-rose-400" : "text-emerald-400")}>
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

      {#if insight.isFirstPeriod && (insight.spent === 0 || insight.categories.length === 0) && !guidedTourUi.hideFirstPeriodHint}
        <p class="text-sm text-slate-400">{m.dashboard_spending_first_period()}</p>
      {/if}
    </div>
  {/if}
{/snippet}

<section
  id="dashboard-spending"
  data-tour-id="tour-spending-insight"
  class="flex min-w-0 flex-col overflow-x-clip rounded-3xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
>
  {#if isMdLayout.current}
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-sm font-medium text-slate-400">{m.dashboard_spending_title()}</h2>
      {#if insight.spent > 0 || insight.categories.length > 0}
        <span class="shrink-0 text-sm font-semibold text-slate-200 tabular-nums">
          {formatCurrency(insight.spent)}
        </span>
      {/if}
    </div>
    <div class="mt-2">
      {@render spendingBody()}
    </div>
  {:else}
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

    <div class={cn("expand-grid", showContent && "expand-grid--open")} aria-hidden={!showContent}>
      <div class="expand-grid-inner">
        <div class="expand-grid-panel pt-2">
          {@render spendingBody()}
        </div>
      </div>
    </div>
  {/if}
</section>
