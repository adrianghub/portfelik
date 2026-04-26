<script lang="ts">
	import type { ShoppingList } from '$lib/types';
	import { formatCurrency, formatDate } from '$lib/utils';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		list: ShoppingList;
		ondelete?: (id: string) => void;
	}
	let { list, ondelete }: Props = $props();
</script>

<div class="flex items-stretch rounded-xl border border-zinc-200 bg-white overflow-hidden">
	<a
		href="/shopping-lists/{list.id}"
		class="flex-1 p-4 hover:bg-zinc-50 transition-colors"
	>
		<div class="flex items-start justify-between gap-2">
			<span class="font-medium text-zinc-900">{list.name}</span>
			<span class={cn(
				'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
				list.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-500'
			)}>
				{list.status === 'active' ? m.shopping_lists_status_active() : m.shopping_lists_status_completed()}
			</span>
		</div>
		<div class="mt-1 flex items-center gap-3 text-xs text-zinc-400">
			<span>{formatDate(list.created_at)}</span>
			{#if list.total_amount != null}
				<span>·</span>
				<span>{formatCurrency(list.total_amount)}</span>
			{/if}
		</div>
	</a>
	{#if ondelete}
		<button
			onclick={() => ondelete(list.id)}
			class="px-3 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors border-l border-zinc-100"
			aria-label={m.shopping_list_delete()}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
		</button>
	{/if}
</div>
