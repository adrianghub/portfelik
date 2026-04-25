<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { cn } from '$lib/utils';
	import type { Profile } from '$lib/types';
	import * as m from '$lib/paraglide/messages';
	import { Wallet, ShoppingBasket, Settings, ShieldCheck, LogOut } from 'lucide-svelte';

	interface Props {
		profile: Profile | null;
	}
	let { profile }: Props = $props();

	const navItems = [
		{ href: '/transactions', label: m.nav_transactions(), icon: Wallet },
		{ href: '/shopping-lists', label: m.nav_shopping_lists(), icon: ShoppingBasket },
		{ href: '/settings', label: m.nav_settings(), icon: Settings }
	];

	const isActive = (href: string) => $page.url.pathname.startsWith(href);

	async function signOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<!-- Desktop top bar -->
<header class="hidden md:flex fixed top-0 inset-x-0 z-50 h-14 border-b border-zinc-200 bg-white px-6 items-center gap-6">
	<span class="font-semibold text-zinc-900 mr-2 shrink-0">{m.app_name()}</span>

	<nav aria-label={m.nav_main()} class="flex items-center gap-1">
		{#each navItems as item}
			{@const Icon = item.icon}
			<a
				href={item.href}
				aria-current={isActive(item.href) ? 'page' : undefined}
				class={cn(
					'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900',
					isActive(item.href)
						? 'bg-zinc-100 text-zinc-900'
						: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
				)}
			>
				<Icon size={15} aria-hidden="true" />
				{item.label}
			</a>
		{/each}

		{#if profile?.role === 'admin'}
			<a
				href="/admin"
				aria-current={isActive('/admin') ? 'page' : undefined}
				class={cn(
					'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900',
					isActive('/admin')
						? 'bg-zinc-100 text-zinc-900'
						: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
				)}
			>
				<ShieldCheck size={15} aria-hidden="true" />
				{m.nav_admin()}
			</a>
		{/if}
	</nav>

	<div class="ml-auto flex items-center gap-3">
		{#if profile}
			<span class="text-xs text-zinc-400 hidden lg:block">{profile.email}</span>
		{/if}
		<button
			type="button"
			onclick={signOut}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
		>
			<LogOut size={15} aria-hidden="true" />
			{m.nav_sign_out()}
		</button>
	</div>
</header>

<!-- Mobile bottom tab bar -->
<nav
	aria-label={m.nav_main()}
	class="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-zinc-200 bg-white flex"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	{#each navItems as item}
		{@const Icon = item.icon}
		<a
			href={item.href}
			aria-current={isActive(item.href) ? 'page' : undefined}
			class={cn(
				'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-2 text-[10px] font-medium transition-colors',
				isActive(item.href) ? 'text-zinc-900' : 'text-zinc-400'
			)}
		>
			<Icon size={22} aria-hidden="true" />
			{item.label}
		</a>
	{/each}

	{#if profile?.role === 'admin'}
		<a
			href="/admin"
			aria-current={isActive('/admin') ? 'page' : undefined}
			class={cn(
				'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-2 text-[10px] font-medium transition-colors',
				isActive('/admin') ? 'text-zinc-900' : 'text-zinc-400'
			)}
		>
			<ShieldCheck size={22} aria-hidden="true" />
			{m.nav_admin()}
		</a>
	{/if}
</nav>
