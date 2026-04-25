<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { fetchShoppingLists } from '$lib/services/shopping-lists';
	import ShoppingListCard from '$lib/components/shopping-lists/ShoppingListCard.svelte';
	import * as m from '$lib/paraglide/messages';

	const query = createQuery(() => ({
		queryKey: ['shopping_lists'],
		queryFn: fetchShoppingLists
	}));

	const active = $derived(query.data?.filter((l) => l.status === 'active') ?? []);
	const completed = $derived(query.data?.filter((l) => l.status === 'completed') ?? []);
</script>

<div class="container mx-auto max-w-3xl px-4 py-6 space-y-5">
	<h1 class="text-xl font-semibold text-zinc-900">{m.shopping_lists_title()}</h1>

	{#if query.isLoading}
		<div class="space-y-2">
			{#each [0, 1, 2] as _}
				<div class="h-16 rounded-xl bg-zinc-100 animate-pulse"></div>
			{/each}
		</div>
	{:else if query.isError}
		<p class="text-sm text-rose-600">{m.common_error_title()}</p>
	{:else if (query.data?.length ?? 0) === 0}
		<p class="text-sm text-zinc-400 text-center py-12">{m.shopping_lists_empty()}</p>
	{:else}
		{#if active.length > 0}
			<section class="space-y-2">
				<h2 class="text-xs font-medium text-zinc-500 uppercase tracking-wide">{m.shopping_lists_active()}</h2>
				{#each active as list}
					<ShoppingListCard {list} />
				{/each}
			</section>
		{/if}

		{#if completed.length > 0}
			<section class="space-y-2">
				<h2 class="text-xs font-medium text-zinc-500 uppercase tracking-wide">{m.shopping_lists_completed()}</h2>
				{#each completed as list}
					<ShoppingListCard {list} />
				{/each}
			</section>
		{/if}
	{/if}
</div>
