<script lang="ts">
  import type { CategorySummary } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    categories: CategorySummary[];
  }
  let { categories }: Props = $props();

  const expenses = $derived(categories.filter((c) => c.type === "expense"));
</script>

{#if expenses.length > 0}
  <div class="rounded-xl border border-zinc-200 bg-white p-4">
    <p class="mb-3 text-sm font-medium text-zinc-900">{m.summary_by_category()}</p>
    <ul class="space-y-2">
      {#each expenses as cat (cat.category_id)}
        <li class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between">
              <span class="truncate text-sm text-zinc-700">{cat.category_name}</span>
              <span class="ml-2 shrink-0 text-sm font-medium text-zinc-900"
                >{formatCurrency(cat.total)}</span
              >
            </div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div class="h-full rounded-full bg-zinc-800" style="width: {cat.percentage}%"></div>
            </div>
          </div>
          <span class="w-10 shrink-0 text-right text-xs text-zinc-400">{cat.percentage}%</span>
        </li>
      {/each}
    </ul>
  </div>
{:else}
  <p class="py-4 text-center text-sm text-zinc-400">{m.summary_no_expenses()}</p>
{/if}
