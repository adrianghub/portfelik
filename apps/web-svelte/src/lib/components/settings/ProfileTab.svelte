<script lang="ts">
	import type { Profile } from '$lib/types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		profile: Profile | null;
	}
	let { profile }: Props = $props();
</script>

{#if !profile}
	<div class="h-32 rounded-xl bg-zinc-100 animate-pulse"></div>
{:else}
	<div class="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
		<div class="px-4 py-3 flex justify-between">
			<span class="text-sm text-zinc-500">{m.profile_name()}</span>
			<span class="text-sm text-zinc-900">{profile.name ?? '—'}</span>
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
