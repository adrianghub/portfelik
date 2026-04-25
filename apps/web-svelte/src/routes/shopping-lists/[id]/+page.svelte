<script lang="ts">
	import { page } from '$app/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { fetchShoppingListById } from '$lib/services/shopping-lists';
	import { formatCurrency, formatDate, cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	const id = $derived($page.params.id ?? '');

	const query = createQuery(() => ({
		queryKey: ['shopping_list', id],
		queryFn: () => fetchShoppingListById(id),
		enabled: !!id
	}));
</script>

<div class="container mx-auto max-w-2xl px-4 py-6 space-y-4">
	<a href="/shopping-lists" class="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
		{m.common_back()}
	</a>

	{#if query.isLoading}
		<div class="space-y-3">
			<div class="h-8 w-48 rounded-lg bg-zinc-100 animate-pulse"></div>
			<div class="space-y-2">
				{#each [0, 1, 2, 3, 4] as _}
					<div class="h-12 rounded-xl bg-zinc-100 animate-pulse"></div>
				{/each}
			</div>
		</div>
	{:else if query.isError}
		<p class="text-sm text-rose-600">{m.common_error_title()}</p>
	{:else if query.data}
		{@const list = query.data}
		<div class="flex items-start justify-between gap-2">
			<h1 class="text-xl font-semibold text-zinc-900">{list.name}</h1>
			<span class={cn(
				'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
				list.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-500'
			)}>
				{list.status === 'active' ? m.shopping_lists_status_active() : m.shopping_lists_status_completed()}
			</span>
		</div>

		<div class="text-xs text-zinc-400">{formatDate(list.created_at)}</div>

		{#if list.shopping_list_items.length === 0}
			<p class="text-sm text-zinc-400 text-center py-8">{m.shopping_list_items_empty()}</p>
		{:else}
			<ul class="space-y-1">
				{#each list.shopping_list_items as item}
					<li class="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3">
						<div class={cn(
							'h-4 w-4 rounded border shrink-0 flex items-center justify-center',
							item.completed ? 'bg-zinc-800 border-zinc-800' : 'border-zinc-300'
						)}>
							{#if item.completed}
								<svg class="text-white w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							{/if}
						</div>
						<span class={cn('text-sm flex-1', item.completed ? 'line-through text-zinc-400' : 'text-zinc-900')}>
							{item.name}
						</span>
						{#if item.quantity != null}
							<span class="text-xs text-zinc-400 shrink-0">
								{item.quantity}{item.unit ? ` ${item.unit}` : ''}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if list.total_amount != null}
			<div class="flex justify-between items-center rounded-xl border border-zinc-200 bg-white px-4 py-3">
				<span class="text-sm font-medium text-zinc-700">{m.shopping_list_total()}</span>
				<span class="text-sm font-semibold text-zinc-900">{formatCurrency(list.total_amount)}</span>
			</div>
		{/if}
	{/if}
</div>
