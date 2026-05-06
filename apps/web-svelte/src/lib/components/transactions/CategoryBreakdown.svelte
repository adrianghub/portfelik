<script lang="ts">
  import type { CategorySummary } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    categories: CategorySummary[];
    oncategoryclick?: (categoryId: string) => void;
  }
  let { categories, oncategoryclick }: Props = $props();

  const expenses = $derived(categories.filter((c) => c.type === "expense"));
</script>

{#if expenses.length > 0}
  <div class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
    <p class="mb-3 text-sm font-medium text-zinc-900">{m.summary_by_category()}</p>
    <ul class="space-y-2">
      {#each expenses as cat (cat.category_id)}
        <li class="flex items-center gap-2">
          {#if oncategoryclick}
            <button
              onclick={() => oncategoryclick(cat.category_id)}
              class="min-w-0 flex-1 text-left transition-opacity hover:opacity-70"
            >
              <div class="flex items-baseline justify-between">
                <span class="truncate text-sm text-zinc-700 dark:text-zinc-300">{cat.category_name}</span>
                <span class="ml-2 shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-100"
                  >{formatCurrency(cat.total)}</span
                >
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                <div class="h-full rounded-full bg-zinc-800 dark:bg-zinc-200" style="width: {cat.percentage}%"></div>
              </div>
            </button>
          {:else}
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between">
                <span class="truncate text-sm text-zinc-700 dark:text-zinc-300">{cat.category_name}</span>
                <span class="ml-2 shrink-0 text-sm font-medium text-zinc-900 dark:text-zinc-100"
                  >{formatCurrency(cat.total)}</span
                >
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                <div class="h-full rounded-full bg-zinc-800 dark:bg-zinc-200" style="width: {cat.percentage}%"></div>
              </div>
            </div>
          {/if}
          <span class="w-10 shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500">{cat.percentage}%</span>
        </li>
      {/each}
    </ul>
  </div>
{:else}
  <p class="py-4 text-center text-sm text-zinc-400">{m.summary_no_expenses()}</p>
{/if}
