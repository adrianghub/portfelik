<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import * as m from '$lib/paraglide/messages';

	let error = $state<string | null>(null);

	onMount(async () => {
		// PKCE flow: Supabase redirects with ?code=
		const code = new URLSearchParams(window.location.search).get('code');
		if (code) {
			const { error: authError } = await supabase.auth.exchangeCodeForSession(code);
			if (authError) { error = m.login_error_generic(); return; }
			goto('/');
			return;
		}

		// Implicit flow: Supabase client auto-exchanges tokens from URL hash.
		// Session may already be set in localStorage by the time we get here.
		const { data: { session } } = await supabase.auth.getSession();
		if (session) { goto('/'); return; }

		// Wait up to 3s for auth state change in case client is still processing hash
		const timer = setTimeout(() => { error = m.login_error_generic(); }, 3000);
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
			if (event === 'SIGNED_IN' && session) {
				clearTimeout(timer);
				subscription.unsubscribe();
				goto('/');
			}
		});
	});
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-50">
	{#if error}
		<div class="rounded-lg bg-red-50 px-6 py-4 text-sm text-red-700">
			{error}
			<a href="/login" class="ml-2 underline">Wróć do logowania</a>
		</div>
	{:else}
		<p class="text-sm text-gray-500">{m.common_loading()}</p>
	{/if}
</div>
