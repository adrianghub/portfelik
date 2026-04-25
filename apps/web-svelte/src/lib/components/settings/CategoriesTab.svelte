<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { fetchCategories } from '$lib/services/categories';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	const query = createQuery(() => ({
		queryKey: ['categories'],
		queryFn: fetchCategories
	}));
</script>

{#if query.isLoading}
	<div class="space-y-2" aria-busy="true" aria-label={m.common_loading()}>
		{#each [0, 1, 2, 3, 4] as _}
			<div class="h-10 rounded-lg bg-zinc-100 animate-pulse"></div>
		{/each}
	</div>
{:else if query.isError}
	<p class="text-sm text-rose-600" role="alert">{m.common_error_title()}</p>
{:else if query.data?.length === 0}
	<p class="text-sm text-zinc-400 text-center py-8">{m.categories_empty()}</p>
{:else if query.data}
	<!-- Mobile card list -->
	<ul class="sm:hidden space-y-1.5">
		{#each query.data as cat}
			<li class="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<span class="text-sm text-zinc-900 truncate">{cat.name}</span>
					{#if !cat.user_id}
						<span class="text-xs text-zinc-400 shrink-0">{m.categories_system()}</span>
					{/if}
				</div>
				<span class={cn(
					'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ml-3',
					cat.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
				)}>
					{cat.type === 'income' ? m.common_income() : m.common_expense()}
				</span>
			</li>
		{/each}
	</ul>

	<!-- Desktop table -->
	<div class="hidden sm:block rounded-xl border border-zinc-200 bg-white overflow-hidden">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-zinc-100 bg-zinc-50">
					<th scope="col" class="px-4 py-3 text-left text-xs font-medium text-zinc-500">{m.categories_col_name()}</th>
					<th scope="col" class="px-4 py-3 text-left text-xs font-medium text-zinc-500">{m.categories_col_type()}</th>
					<th scope="col" class="px-4 py-3 text-left text-xs font-medium text-zinc-500"></th>
				</tr>
			</thead>
			<tbody>
				{#each query.data as cat}
					<tr class="border-b border-zinc-50 last:border-0">
						<td class="px-4 py-3 text-zinc-900">{cat.name}</td>
						<td class="px-4 py-3">
							<span class={cn(
								'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
								cat.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
							)}>
								{cat.type === 'income' ? m.common_income() : m.common_expense()}
							</span>
						</td>
						<td class="px-4 py-3">
							{#if !cat.user_id}
								<span class="text-xs text-zinc-400">{m.categories_system()}</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
