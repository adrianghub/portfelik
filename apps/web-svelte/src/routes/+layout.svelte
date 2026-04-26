<script lang="ts">
	import '../app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import { fetchProfile } from '$lib/services/profiles';
	import { registerServiceWorker, subscribeToPush, unsubscribeFromPush } from '$lib/services/push';
	import type { Profile } from '$lib/types';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 5 * 60 * 1000,
				gcTime: 24 * 60 * 60 * 1000,
				retry: 2,
				networkMode: 'offlineFirst',
				refetchOnReconnect: true
			}
		}
	});

	let { children } = $props();

	const PUBLIC_PATHS = ['/login', '/auth/callback'];
	let profile = $state<Profile | null>(null);
	let isPublicRoute = $derived(PUBLIC_PATHS.includes(page.url.pathname));

	onMount(async () => {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session && !isPublicRoute) {
			goto('/login');
			return;
		}

		if (session) {
			fetchProfile(session.user.id)
				.then((p) => (profile = p))
				.catch(() => {});
			registerServiceWorker().then(() => subscribeToPush(session.user.id).catch(() => {}));
		}

		supabase.auth.onAuthStateChange((event, session) => {
			if (event === 'SIGNED_OUT') {
				unsubscribeFromPush().catch(() => {});
				profile = null;
				goto('/login');
			}
			if (event === 'SIGNED_IN' && session) {
				fetchProfile(session.user.id)
					.then((p) => (profile = p))
					.catch(() => {});
				registerServiceWorker().then(() => subscribeToPush(session.user.id).catch(() => {}));
				if (page.url.pathname === '/login') goto('/transactions');
			}
		});
	});
</script>

<QueryClientProvider client={queryClient}>
	{#if !isPublicRoute}
		<Navigation {profile} />
		<main class="pt-14 pb-16 md:pb-0 min-h-screen">
			{@render children()}
		</main>
	{:else}
		{@render children()}
	{/if}
</QueryClientProvider>
