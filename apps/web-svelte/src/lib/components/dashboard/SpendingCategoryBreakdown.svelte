<script lang="ts">
  import type { CategoryInsight } from "$lib/services/spending-insight";
  import {
    categorySharePct,
    DASHBOARD_PREVIEW_CATEGORIES,
    formatDeltaPct,
    isSignificantDeltaPct,
    topSpendingCategories,
  } from "$lib/services/spending-category-display";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import DashboardSeeMoreButton from "$lib/components/dashboard/DashboardSeeMoreButton.svelte";
  import { cn, formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  let {
    categories,
    spent,
    isFirstPeriod,
    categoryHref,
  }: {
    categories: CategoryInsight[];
    spent: number;
    isFirstPeriod: boolean;
    categoryHref: (categoryId: string) => string;
  } = $props();

  let categoriesDialogOpen = $state(false);

  const allCategories = $derived(topSpendingCategories(categories, categories.length));
  const previewCategories = $derived(
    topSpendingCategories(categories, DASHBOARD_PREVIEW_CATEGORIES)
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
