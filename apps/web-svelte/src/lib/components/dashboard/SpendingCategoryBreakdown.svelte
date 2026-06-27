<script lang="ts">
  import type { CategoryInsight } from "$lib/services/spending-insight";
  import {
    categorySharePct,
    formatDeltaPct,
    isSignificantDeltaPct,
    topSpendingCategories,
    topSpendingMovers,
  } from "$lib/services/spending-category-display";
  import { cn, formatCurrency } from "$lib/utils";
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

  const topCategories = $derived(topSpendingCategories(categories));
  const movers = $derived(isFirstPeriod ? [] : topSpendingMovers(biggestMovers));
</script>

{#if topCategories.length > 0}
  <div class="mt-4">
    <p class="text-eyebrow text-slate-400">{m.dashboard_categories_title()}</p>
    <ul class="mt-2 space-y-2">
      {#each topCategories as cat (cat.categoryId)}
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
      {/each}
    </ul>
  </div>
{/if}

{#if movers.length > 0}
  <div class="mt-4 border-t border-white/5 pt-4">
    <p class="text-eyebrow text-slate-400">{m.dashboard_spending_category_details()}</p>
    <ul class="mt-2 space-y-1.5">
      {#each movers as cat (cat.categoryId)}
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
      {/each}
    </ul>
  </div>
{/if}
