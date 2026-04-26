<script lang="ts">
	import { createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { updateProfile } from '$lib/services/profiles';
	import type { Profile } from '$lib/types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		profile: Profile | null;
	}
	let { profile }: Props = $props();

	const queryClient = useQueryClient();

	let editing = $state(false);
	let nameInput = $state('');

	function startEdit() {
		nameInput = profile?.name ?? '';
		editing = true;
	}

	const mutation = createMutation(() => ({
		mutationFn: () => updateProfile(profile!.id, { name: nameInput }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['profile'] });
			editing = false;
		}
	}));

	function handleSubmit(e: Event) {
		e.preventDefault();
		mutation.mutate();
	}
</script>

{#if !profile}
	<div class="h-32 rounded-xl bg-zinc-100 animate-pulse"></div>
{:else}
	<div class="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
		<div class="px-4 py-3 flex justify-between items-center gap-3">
			<span class="text-sm text-zinc-500 shrink-0">{m.profile_name()}</span>
			{#if editing}
				<form onsubmit={handleSubmit} class="flex items-center gap-2 flex-1">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={nameInput}
						autofocus
						class="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
					/>
					<button
						type="submit"
						disabled={mutation.isPending}
						class="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
					>
						{mutation.isPending ? m.common_saving() : m.common_save()}
					</button>
					<button
						type="button"
						onclick={() => (editing = false)}
						class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
					>
						{m.common_cancel()}
					</button>
				</form>
			{:else}
				<div class="flex items-center gap-2">
					<span class="text-sm text-zinc-900">{profile.name ?? '—'}</span>
					<button
						onclick={startEdit}
						class="p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
						aria-label={m.common_edit()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
					</button>
				</div>
			{/if}
		</div>
		<div class="px-4 py-3 flex justify-between">
			<span class="text-sm text-zinc-500">{m.profile_email()}</span>
			<span class="text-sm text-zinc-900">{profile.email}</span>
		</div>
		<div class="px-4 py-3 flex justify-between">
			<span class="text-sm text-zinc-500">{m.profile_role()}</span>
			<span class="text-sm text-zinc-900">
				{profile.role === 'admin' ? m.profile_role_admin() : m.profile_role_user()}
			</span>
		</div>
	</div>
{/if}
