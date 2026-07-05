<script lang="ts">
  import type { CategoryInsight } from "$lib/services/spending-insight";
  import {
    categorySharePct,
    DASHBOARD_PREVIEW_CATEGORIES,
    DASHBOARD_PREVIEW_MOVERS,
    formatDeltaPct,
    isSignificantDeltaPct,
    topSpendingCategories,
    topSpendingMovers,
  } from "$lib/services/spending-category-display";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import DashboardSeeMoreButton from "$lib/components/dashboard/DashboardSeeMoreButton.svelte";
  import { cn, formatCurrency } from "$lib/utils";
  import { guidedTourUi } from "$lib/guided-tour/ui.svelte";
  import * as m from "$lib/paraglide/messages";

  let {
    categories,
    biggestMovers,
    spent,
    isFirstPeriod,
    categoryHref,
  }: {
    categories: CategoryInsight[];
    biggestMovers: CategoryInsight[];
    spent: number;
    isFirstPeriod: boolean;
    categoryHref: (categoryId: string) => string;
  } = $props();

  let categoriesDialogOpen = $state(false);
  let moversDialogOpen = $state(false);

  const allCategories = $derived(topSpendingCategories(categories, categories.length));
  const previewCategories = $derived(
    topSpendingCategories(categories, DASHBOARD_PREVIEW_CATEGORIES)
  );
  const allMovers = $derived(
    isFirstPeriod ? [] : topSpendingMovers(biggestMovers, biggestMovers.length)
  );
  const previewMovers = $derived(
    isFirstPeriod ? [] : topSpendingMovers(biggestMovers, DASHBOARD_PREVIEW_MOVERS)
  );
</script>

{#snippet categoryRow(cat: CategoryInsight)}
  <li>
    <a
      href={categoryHref(cat.categoryId)}
      class="focus-visible:ring-accent block min-w-0 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      <div class="flex min-w-0 items-baseline justify-between gap-2">
        <span class="min-w-0 truncate text-sm text-slate-300">{cat.name}</span>
        <span class="flex shrink-0 items-baseline gap-2">
          {#if !isFirstPeriod && isSignificantDeltaPct(cat.deltaPct)}
            <span
              class={cn(
                "text-[11px] font-medium tabular-nums",
                cat.deltaPct >= 0 ? "text-rose-400" : "text-emerald-400"
              )}
            >
              {formatDeltaPct(cat.deltaPct)}
            </span>
          {/if}
          <span class="text-sm font-medium text-slate-100 tabular-nums"
            >{formatCurrency(cat.total)}</span
          >
        </span>
      </div>
      <div class="mt-1 flex items-center gap-2">
        <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
          <div
            class="bg-accent-gradient h-full rounded-full shadow-[0_0_12px_var(--color-accent-glow)]"
            style="width: {categorySharePct(cat.total, spent)}%"
          ></div>
        </div>
        {#if categorySharePct(cat.total, spent) > 0}
          <span class="w-8 shrink-0 text-right text-xs text-slate-400 tabular-nums"
            >{categorySharePct(cat.total, spent)}%</span
          >
        {/if}
      </div>
    </a>
  </li>
{/snippet}

{#snippet moverRow(cat: CategoryInsight)}
  <li>
    <a
      href={categoryHref(cat.categoryId)}
      class="focus-visible:ring-accent flex min-w-0 items-baseline justify-between gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span class="min-w-0 truncate text-sm text-slate-300">{cat.name}</span>
      <span class="shrink-0 text-sm text-slate-400 tabular-nums">
        {#if cat.deltaAbs >= 0}
          {m.dashboard_spending_delta_more({
            amount: formatCurrency(Math.abs(cat.deltaAbs)),
          })}
        {:else}
          {m.dashboard_spending_delta_less({
            amount: formatCurrency(Math.abs(cat.deltaAbs)),
          })}
        {/if}
      </span>
    </a>
  </li>
{/snippet}

<div>
  {#if previewCategories.length > 0}
    <div class="mt-4">
      <p class="text-eyebrow text-slate-400">{m.dashboard_categories_title()}</p>
      <ul class="mt-2 space-y-2">
        {#each previewCategories as cat (cat.categoryId)}
          {@render categoryRow(cat)}
        {/each}
      </ul>
      {#if allCategories.length > previewCategories.length}
        <DashboardSeeMoreButton onclick={() => (categoriesDialogOpen = true)} />
      {/if}
    </div>
  {/if}

  {#if previewMovers.length > 0}
    <div class="mt-4 border-t border-white/5 pt-4">
      <p class="text-eyebrow text-slate-400">{m.dashboard_spending_category_details()}</p>
      <ul class="mt-2 space-y-1.5">
        {#each previewMovers as cat (cat.categoryId)}
          {@render moverRow(cat)}
        {/each}
      </ul>
      {#if allMovers.length > previewMovers.length}
        <DashboardSeeMoreButton onclick={() => (moversDialogOpen = true)} />
      {/if}
    </div>
  {:else if isFirstPeriod && previewCategories.length > 0 && !guidedTourUi.hideFirstPeriodHint}
    <div class="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p class="text-xs leading-relaxed text-slate-400">{m.dashboard_spending_first_period()}</p>
    </div>
  {/if}
</div>

<Dialog
  open={categoriesDialogOpen}
  onclose={() => (categoriesDialogOpen = false)}
  title={m.dashboard_all_categories_title()}
>
  <ul class="space-y-2">
    {#each allCategories as cat (cat.categoryId)}
      {@render categoryRow(cat)}
    {/each}
  </ul>
</Dialog>

<Dialog
  open={moversDialogOpen}
  onclose={() => (moversDialogOpen = false)}
  title={m.dashboard_all_movers_title()}
>
  <ul class="space-y-1.5">
    {#each allMovers as cat (cat.categoryId)}
      {@render moverRow(cat)}
    {/each}
  </ul>
</Dialog>
