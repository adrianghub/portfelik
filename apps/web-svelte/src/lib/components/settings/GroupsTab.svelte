<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { fetchUserGroups } from '$lib/services/groups';
	import { supabase } from '$lib/supabase';
	import * as m from '$lib/paraglide/messages';

	const groupsQuery = createQuery(() => ({
		queryKey: ['user_groups'],
		queryFn: fetchUserGroups
	}));

	let currentUserId = $state<string | undefined>(undefined);

	supabase.auth.getSession().then(({ data }) => {
		currentUserId = data.session?.user.id;
	});
</script>

{#if groupsQuery.isLoading}
	<div class="space-y-2">
		{#each [0, 1, 2] as _}
			<div class="h-14 rounded-xl bg-zinc-100 animate-pulse"></div>
		{/each}
	</div>
{:else if groupsQuery.isError}
	<p class="text-sm text-rose-600">{m.common_error_title()}</p>
{:else if groupsQuery.data?.length === 0}
	<p class="text-sm text-zinc-400 text-center py-8">{m.groups_empty()}</p>
{:else if groupsQuery.data}
	<div class="space-y-2">
		{#each groupsQuery.data as group}
			<div class="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3">
				<span class="text-sm font-medium text-zinc-900">{group.name}</span>
				<span class="text-xs text-zinc-400">
					{group.owner_id === currentUserId ? m.groups_role_owner() : m.groups_role_member()}
				</span>
			</div>
		{/each}
	</div>
{/if}
