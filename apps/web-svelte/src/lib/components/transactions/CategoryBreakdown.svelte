<script lang="ts">
	import type { CategorySummary } from '$lib/types';
	import { formatCurrency } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		categories: CategorySummary[];
	}
	let { categories }: Props = $props();

	const expenses = $derived(categories.filter((c) => c.type === 'expense'));
</script>

{#if expenses.length > 0}
	<div class="rounded-xl border border-zinc-200 bg-white p-4">
		<p class="text-sm font-medium text-zinc-900 mb-3">{m.summary_by_category()}</p>
		<ul class="space-y-2">
			{#each expenses as cat}
				<li class="flex items-center gap-2">
					<div class="flex-1 min-w-0">
						<div class="flex justify-between items-baseline">
							<span class="text-sm text-zinc-700 truncate">{cat.category_name}</span>
							<span class="text-sm font-medium text-zinc-900 ml-2 shrink-0">{formatCurrency(cat.total)}</span>
						</div>
						<div class="mt-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
							<div
								class="h-full rounded-full bg-zinc-800"
								style="width: {cat.percentage}%"
							></div>
						</div>
					</div>
					<span class="text-xs text-zinc-400 shrink-0 w-10 text-right">{cat.percentage}%</span>
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<p class="text-sm text-zinc-400 text-center py-4">{m.summary_no_expenses()}</p>
{/if}
