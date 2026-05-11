<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabase";
  import { cn } from "$lib/utils";
  import type { Profile } from "$lib/types";
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
  }
  let { profile }: Props = $props();

  const navItems = [
    { href: "/dashboard", label: m.nav_dashboard(), icon: LayoutDashboard },
    { href: "/transactions", label: m.nav_transactions(), icon: Wallet },
    { href: "/shopping-lists", label: m.nav_shopping_lists(), icon: ShoppingBasket },
    { href: "/settings", label: m.nav_settings(), icon: Settings },
  ];

  const isActive = (href: string) => $page.url.pathname.startsWith(href);

  async function signOut() {
    await supabase.auth.signOut();
    goto("/login");
  }
</script>

<header
  class="fixed inset-x-0 top-0 z-50 hidden h-14 items-center gap-6 border-b border-slate-200 bg-white px-6 md:flex dark:border-slate-800 dark:bg-slate-900"
>
  <span class="mr-2 shrink-0 font-bold text-slate-900 dark:text-slate-100">{m.app_name()}</span>

  <nav aria-label={m.nav_main()} class="flex items-center gap-1">
    {#each navItems as item (item.href)}
      {@const Icon = item.icon}
      <a
        href={item.href}
        aria-current={isActive(item.href) ? "page" : undefined}
        class={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:focus-visible:ring-emerald-400",
          isActive(item.href)
            ? "bg-slate-100 text-slate-900 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        )}
      >
        <Icon size={15} aria-hidden="true" />
        {item.label}
      </a>
    {/each}

    {#if profile?.role === "admin"}
      <a
        href="/admin"
        aria-current={isActive("/admin") ? "page" : undefined}
        class={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:focus-visible:ring-emerald-400",
          isActive("/admin")
            ? "bg-slate-100 text-slate-900 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        )}
      >
        <ShieldCheck size={15} aria-hidden="true" />
        {m.nav_admin()}
      </a>
    {/if}
  </nav>

  <div class="ml-auto flex items-center gap-2">
    {#if profile}
      <span class="hidden text-xs text-slate-400 lg:block">{profile.email}</span>
    {/if}
    <NotificationsPopover />
    <button
      type="button"
      onclick={signOut}
      class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-emerald-400"
    >
      <LogOut size={15} aria-hidden="true" />
      {m.nav_sign_out()}
    </button>
  </div>
</header>

<nav
  aria-label={m.nav_main()}
  class="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900"
  style="padding-bottom: env(safe-area-inset-bottom)"
>
  {#each navItems as item (item.href)}
    {@const Icon = item.icon}
    <a
      href={item.href}
      aria-current={isActive(item.href) ? "page" : undefined}
      class={cn(
        "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        isActive(item.href)
          ? "text-slate-900 dark:text-emerald-400"
          : "text-slate-400 dark:text-slate-400"
      )}
    >
      <Icon size={22} aria-hidden="true" />
      {item.label}
    </a>
  {/each}

  <div class="relative flex min-h-[56px] flex-1 items-center justify-center">
    <NotificationsPopover
      placement="bottom"
      buttonClass="relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-slate-400 transition-colors min-h-[56px] w-full"
    />
  </div>

  {#if profile?.role === "admin"}
    <a
      href="/admin"
      aria-current={isActive("/admin") ? "page" : undefined}
      class={cn(
        "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        isActive("/admin")
          ? "text-slate-900 dark:text-emerald-400"
          : "text-slate-400 dark:text-slate-400"
      )}
    >
      <ShieldCheck size={22} aria-hidden="true" />
      {m.nav_admin()}
    </a>
  {/if}
</nav>
