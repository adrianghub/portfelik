<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let user = $state<{ email?: string } | null>(null);

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) { goto('/login'); return; }
		user = session.user;
	});

	async function signOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
	{#if user}
		<p class="text-lg font-semibold text-gray-800">Portfelik</p>
		<p class="text-sm text-gray-500">{user.email}</p>
		<button
			onclick={signOut}
			class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
		>
			Wyloguj się
		</button>
		<p class="text-xs text-gray-400">Dashboard — wkrótce (Phase 4)</p>
	{:else}
		<p class="text-sm text-gray-400">Ładowanie...</p>
	{/if}
</div>
