<script lang="ts">
  import "../app.css";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { Toaster } from "svelte-sonner";
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Navigation from "$lib/components/Navigation.svelte";
  import { fetchProfile } from "$lib/services/profiles";
  import {
    registerServiceWorker,
    autoSubscribePush,
    requestAndSubscribePush,
    unsubscribeFromPush,
  } from "$lib/services/push";
  import type { Profile } from "$lib/types";
  import * as m from "$lib/paraglide/messages";

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 2,
        networkMode: "offlineFirst",
        refetchOnReconnect: true,
      },
    },
  });

  let { children } = $props();

  const PUBLIC_PATHS = ["/login", "/auth/callback"];
  let profile = $state<Profile | null>(null);
  let userId = $state<string | null>(null);
  let notifPermission = $state<NotificationPermission>("default");
  let isPublicRoute = $derived(PUBLIC_PATHS.includes(page.url.pathname));
  let showNotifBanner = $derived(
    !!userId && !isPublicRoute && notifPermission === "default" && "Notification" in window
  );

  async function enableNotifications() {
    if (!userId) return;
    const granted = await requestAndSubscribePush(userId);
    notifPermission = granted ? "granted" : Notification.permission;
  }

  onMount(async () => {
    if ("Notification" in window) notifPermission = Notification.permission;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session && !isPublicRoute) {
      goto("/login");
      return;
    }

    if (session) {
      userId = session.user.id;
      fetchProfile(session.user.id)
        .then((p) => (profile = p))
        .catch(() => {});
      registerServiceWorker().then(() => autoSubscribePush(session.user.id).catch(() => {}));
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        unsubscribeFromPush().catch(() => {});
        profile = null;
        userId = null;
        goto("/login");
      }
      if (event === "SIGNED_IN" && session) {
        userId = session.user.id;
        fetchProfile(session.user.id)
          .then((p) => (profile = p))
          .catch(() => {});
        registerServiceWorker().then(() => autoSubscribePush(session.user.id).catch(() => {}));
        if (page.url.pathname === "/login") goto("/transactions");
      }
    });
  });
</script>

<Toaster richColors position="bottom-right" />
<QueryClientProvider client={queryClient}>
  {#if !isPublicRoute}
    <Navigation {profile} />
    {#if showNotifBanner}
      <div
        class="fixed inset-x-0 top-14 z-40 flex items-center justify-between gap-3 bg-zinc-900 px-4 py-2 text-sm text-white"
      >
        <span class="text-zinc-300">{m.push_banner_text()}</span>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onclick={enableNotifications}
            class="rounded-md bg-white px-3 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            {m.push_banner_enable()}
          </button>
          <button
            type="button"
            onclick={() => (notifPermission = "denied")}
            class="rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
            aria-label={m.common_close()}
          >
            ✕
          </button>
        </div>
      </div>
    {/if}
    <main class="min-h-screen pt-14 pb-16 md:pb-0">
      {@render children()}
    </main>
  {:else}
    {@render children()}
  {/if}
</QueryClientProvider>
