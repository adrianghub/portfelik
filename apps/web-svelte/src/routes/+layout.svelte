<script lang="ts">
	import '../app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	const queryClient = new QueryClient();
	let { children } = $props();

	const PUBLIC_PATHS = ['/login', '/auth/callback'];

	onMount(async () => {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session && !PUBLIC_PATHS.includes(page.url.pathname)) {
			goto('/login');
		}

		supabase.auth.onAuthStateChange((event, session) => {
			if (event === 'SIGNED_OUT') goto('/login');
			if (event === 'SIGNED_IN' && session && page.url.pathname === '/login') goto('/');
		});
	});
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
