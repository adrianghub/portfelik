<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabase";
  import { cn } from "$lib/utils";
  import type { Profile } from "$lib/types";
  import type { User } from "@supabase/supabase-js";
  import * as m from "$lib/paraglide/messages";
  import {
    LayoutDashboard,
    Wallet,
    ShoppingBasket,
    Settings,
    ShieldCheck,
    LogOut,
  } from "lucide-svelte";
  import NotificationsPopover from "$lib/components/ui/NotificationsPopover.svelte";

  interface Props {
    profile: Profile | null;
    user: User | null;
  }
  let { profile, user }: Props = $props();

  const navItems = [
    { href: "/transactions", label: m.nav_transactions(), icon: Wallet },
    { href: "/dashboard", label: m.nav_dashboard(), icon: LayoutDashboard },
    { href: "/shopping-lists", label: m.nav_shopping_lists(), icon: ShoppingBasket },
  ];

  const isActive = (href: string) => $page.url.pathname.startsWith(href);

  let menuOpen = $state(false);
  let menuButtonRef = $state<HTMLButtonElement | null>(null);
  let menuButtonMobileRef = $state<HTMLButtonElement | null>(null);
  let mobileNavHidden = $state(false);
  let lastScrollY = 0;

  const avatarUrl = $derived<string | null>(
    (user?.user_metadata?.avatar_url as string | undefined) ?? null
  );
  const initials = $derived.by(() => {
    const source = profile?.name?.trim() || profile?.email || user?.email || "";
    if (!source) return "?";
    const parts = source.split(/[\s@.]+/).filter(Boolean);
    if (parts.length === 0) return source[0]?.toUpperCase() ?? "?";
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  });
  const email = $derived(profile?.email ?? user?.email ?? "");

  async function signOut() {
    menuOpen = false;
    await supabase.auth.signOut();
    goto("/login");
  }

  function onWindowScroll() {
    const y = window.scrollY;
    const delta = y - lastScrollY;
    if (y < 24) {
      mobileNavHidden = false;
    } else if (delta > 8 && y > 80) {
      mobileNavHidden = true;
    } else if (delta < -8) {
      mobileNavHidden = false;
    }
    lastScrollY = y;
  }

  function onDocClick(e: MouseEvent) {
    if (!menuOpen) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (menuButtonRef?.contains(target)) return;
    if (menuButtonMobileRef?.contains(target)) return;
    const popover = document.getElementById("nav-avatar-popover");
    if (popover && !popover.contains(target)) menuOpen = false;
  }

  $effect(() => {
    if (typeof document === "undefined") return;
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  });

  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("mobile-nav-hidden", mobileNavHidden);
    return () => document.documentElement.classList.remove("mobile-nav-hidden");
  });
</script>

<svelte:window onscroll={onWindowScroll} />

<!-- Desktop top bar -->
<header
  class="fixed inset-x-0 top-0 z-50 hidden h-14 items-center gap-4 border-b border-white/5 bg-slate-950/80 px-6 backdrop-blur md:flex"
>
  <span class="mr-2 shrink-0 text-base font-semibold tracking-tight text-slate-100"
    >{m.app_name()}</span
  >

  <nav aria-label={m.nav_main()} class="flex items-center gap-1">
    {#each navItems as item (item.href)}
      {@const Icon = item.icon}
      {@const active = isActive(item.href)}
      <a
        href={item.href}
        aria-current={active ? "page" : undefined}
        class={cn(
          "focus-visible:ring-accent relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          active
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_24px_var(--color-accent-glow)]"
            : "text-slate-300 hover:bg-white/5 hover:text-slate-100"
        )}
      >
        <Icon size={15} aria-hidden="true" strokeWidth={active ? 2.2 : 1.7} />
        {item.label}
      </a>
    {/each}

    {#if profile?.role === "admin"}
      {@const active = isActive("/admin")}
      <a
        href="/admin"
        aria-current={active ? "page" : undefined}
        class={cn(
          "focus-visible:ring-accent relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          active
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_24px_var(--color-accent-glow)]"
            : "text-slate-300 hover:bg-white/5 hover:text-slate-100"
        )}
      >
        <ShieldCheck size={15} aria-hidden="true" strokeWidth={active ? 2.2 : 1.7} />
        {m.nav_admin()}
      </a>
    {/if}
  </nav>

  <div class="relative ml-auto flex items-center gap-2">
    <NotificationsPopover />
    <button
      bind:this={menuButtonRef}
      type="button"
      onclick={() => (menuOpen = !menuOpen)}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={email || "Account"}
      class="focus-visible:ring-accent relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-xs font-semibold text-slate-100 transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:outline-none"
    >
      {#if avatarUrl}
        <img
          src={avatarUrl}
          alt=""
          class="h-full w-full object-cover"
          referrerpolicy="no-referrer"
        />
      {:else}
        <span aria-hidden="true">{initials}</span>
      {/if}
    </button>
  </div>
</header>

<!-- Mobile top bar -->
<header
  class="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-white/5 bg-slate-950/80 px-4 backdrop-blur md:hidden"
>
  <span class="text-base font-semibold tracking-tight text-slate-100">{m.app_name()}</span>
  <div class="ml-auto">
    <NotificationsPopover />
  </div>
  <button
    bind:this={menuButtonMobileRef}
    type="button"
    onclick={() => (menuOpen = !menuOpen)}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-label={email || "Account"}
    class="focus-visible:ring-accent relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-xs font-semibold text-slate-100 transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:outline-none"
  >
    {#if avatarUrl}
      <img src={avatarUrl} alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer" />
    {:else}
      <span aria-hidden="true">{initials}</span>
    {/if}
  </button>
</header>

<!-- Shared avatar popover (fixed to viewport) -->
{#if menuOpen}
  <div
    id="nav-avatar-popover"
    role="menu"
    class="fixed top-14 right-3 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-lg backdrop-blur"
  >
    <div class="border-b border-white/5 px-3 py-2.5">
      <p class="truncate text-xs text-slate-400">{email}</p>
    </div>
    <a
      href="/settings"
      role="menuitem"
      onclick={() => (menuOpen = false)}
      class={cn(
        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5",
        isActive("/settings") ? "text-accent" : "text-slate-200"
      )}
    >
      <Settings size={15} aria-hidden="true" />
      {m.nav_settings()}
    </a>
    <button
      type="button"
      role="menuitem"
      onclick={signOut}
      class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
    >
      <LogOut size={15} aria-hidden="true" />
      {m.nav_sign_out()}
    </button>
  </div>
{/if}

<!-- Mobile floating pill bottom nav -->
<nav
  aria-label={m.nav_main()}
  class="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 transition-transform duration-200 ease-out md:hidden"
  class:translate-y-full={mobileNavHidden}
  style="padding-bottom: env(safe-area-inset-bottom)"
>
  <div
    class="mx-3 mb-3 flex items-center justify-around rounded-2xl border border-white/10 bg-slate-900/80 px-2 py-2 shadow-lg backdrop-blur"
  >
    {#each navItems as item (item.href)}
      {@const Icon = item.icon}
      {@const active = isActive(item.href)}
      <a
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        class={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full transition-all",
          active
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "text-slate-300 hover:text-slate-100"
        )}
      >
        <Icon size={20} aria-hidden="true" strokeWidth={active ? 2.3 : 1.7} />
      </a>
    {/each}

    {#if profile?.role === "admin"}
      {@const active = isActive("/admin")}
      <a
        href="/admin"
        aria-current={active ? "page" : undefined}
        aria-label={m.nav_admin()}
        class={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full transition-all",
          active
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "text-slate-300 hover:text-slate-100"
        )}
      >
        <ShieldCheck size={20} aria-hidden="true" strokeWidth={active ? 2.3 : 1.7} />
      </a>
    {/if}
  </div>
</nav>
