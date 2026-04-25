<script lang="ts">
	import type { ShoppingList } from '$lib/types';
	import { formatCurrency, formatDate } from '$lib/utils';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		list: ShoppingList;
	}
	let { list }: Props = $props();
</script>

<a
	href="/shopping-lists/{list.id}"
	class="block rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50 transition-colors"
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
