<script lang="ts">
  import "../app.css";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { Toaster } from "svelte-sonner";
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import Navigation from "$lib/components/Navigation.svelte";
  import OfflineIndicator from "$lib/components/ui/OfflineIndicator.svelte";
  import { fetchProfile } from "$lib/services/profiles";
  import {
    registerServiceWorker,
    autoSubscribePush,
    requestAndSubscribePush,
    unsubscribeFromPush,
  } from "$lib/services/push";
  import type { Profile } from "$lib/types";
  import type { User } from "@supabase/supabase-js";
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
  const PUSH_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  const PUSH_PROMPT_STORAGE_KEY = "push_prompted_at";

  let profile = $state<Profile | null>(null);
  let user = $state<User | null>(null);
  let userId = $state<string | null>(null);
  let notifPermission = $state<NotificationPermission>("default");
  let pushPromptedRecently = $state(false);
  let isPublicRoute = $derived(PUBLIC_PATHS.includes(page.url.pathname));
  let showNotifBanner = $derived(
    !!userId &&
      !isPublicRoute &&
      notifPermission === "default" &&
      "Notification" in window &&
      !pushPromptedRecently
  );

  function readPushPromptCooldown() {
    try {
      const last = Number(localStorage.getItem(PUSH_PROMPT_STORAGE_KEY)) || 0;
      pushPromptedRecently = last > 0 && Date.now() - last < PUSH_PROMPT_COOLDOWN_MS;
    } catch {
      pushPromptedRecently = false;
    }
  }

  function markPushPrompted() {
    try {
      localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable (private mode etc.) — fall back to in-memory only
    }
    pushPromptedRecently = true;
  }

  async function enableNotifications() {
    if (!userId) return;
    const granted = await requestAndSubscribePush(userId);
    notifPermission = granted ? "granted" : Notification.permission;
    markPushPrompted();
  }

  function dismissPushBanner() {
    markPushPrompted();
  }

  onMount(async () => {
    if ("Notification" in window) notifPermission = Notification.permission;
    readPushPromptCooldown();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session && !isPublicRoute) {
      goto("/login");
      return;
    }

    if (session) {
      user = session.user;
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
        user = null;
        userId = null;
        goto("/login");
      }
      if (event === "SIGNED_IN" && session) {
        user = session.user;
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
<OfflineIndicator />
<QueryClientProvider client={queryClient}>
  {#if !isPublicRoute}
    <Navigation {profile} {user} />
    {#if showNotifBanner}
      <div
        class="fixed inset-x-0 top-14 z-40 flex items-center justify-between gap-3 border-b border-white/5 bg-slate-900/90 px-4 py-2 text-sm text-white backdrop-blur"
      >
        <span class="text-slate-300">{m.push_banner_text()}</span>
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
            onclick={dismissPushBanner}
            class="rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:text-white"
            aria-label={m.common_close()}
          >
            ✕
          </button>
        </div>
      </div>
    {/if}
    <main class="min-h-screen bg-slate-950 pt-14 pb-24 md:pb-6">
      {#key page.url.pathname}
        <div in:fade={{ duration: 140 }}>
          {@render children()}
        </div>
      {/key}
    </main>
  {:else}
    {@render children()}
  {/if}
</QueryClientProvider>
