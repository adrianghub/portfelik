<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    clearLoginRedirect,
    consumeLoginRedirect,
    loginUrlForTarget,
    rememberLoginRedirect,
  } from "$lib/auth-redirect";
  import Navigation from "$lib/components/Navigation.svelte";
  import Breadcrumbs from "$lib/components/ui/Breadcrumbs.svelte";
  import OfflineIndicator from "$lib/components/ui/OfflineIndicator.svelte";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import { fetchProfile } from "$lib/services/profiles";
  import { applyAccent } from "$lib/theme/accent-presets";
  import {
    autoSubscribePush,
    registerServiceWorker,
    requestAndSubscribePush,
    unsubscribeFromPush,
  } from "$lib/services/push";
  import { supabase } from "$lib/supabase";
  import type { Profile } from "$lib/types";
  import type { User } from "@supabase/supabase-js";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { Toaster } from "svelte-sonner";
  import { fade } from "svelte/transition";
  import "../app.css";

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
  let authStatus = $state<"checking" | "authenticated" | "anonymous">("checking");
  let authRevision = 0;
  let notifPermission = $state<NotificationPermission>("default");
  let pushPromptedRecently = $state(false);
  let isPublicRoute = $derived(PUBLIC_PATHS.includes(page.url.pathname));
  let canRenderProtectedRoute = $derived(isPublicRoute || authStatus === "authenticated");
  let showNotifBanner = $derived(
    !!userId &&
      !isPublicRoute &&
      notifPermission === "default" &&
      typeof window !== "undefined" &&
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

  function redirectToLogin() {
    const target = `${page.url.pathname}${page.url.search}`;
    rememberLoginRedirect(target);
    void goto(loginUrlForTarget(target), { replaceState: true });
  }

  $effect(() => {
    if (typeof window === "undefined" || authStatus === "checking") return;
    if (!isPublicRoute && authStatus === "anonymous") {
      redirectToLogin();
    } else if (page.url.pathname === "/login" && authStatus === "authenticated") {
      void goto(consumeLoginRedirect(page.url), { replaceState: true });
    }
  });

  function clearAuthenticatedUser() {
    authRevision += 1;
    profile = null;
    user = null;
    userId = null;
    authStatus = "anonymous";
  }

  function loadAuthenticatedUser(authUser: User) {
    const revision = (authRevision += 1);
    user = authUser;
    userId = authUser.id;
    authStatus = "authenticated";
    fetchProfile(authUser.id)
      .then((p) => {
        if (revision === authRevision) {
          profile = p;
          applyAccent(p.settings?.accentColor);
        }
      })
      .catch(() => {});
    registerServiceWorker().then(() => autoSubscribePush(authUser.id).catch(() => {}));
  }

  onMount(async () => {
    if ("Notification" in window) notifPermission = Notification.permission;
    readPushPromptCooldown();

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        unsubscribeFromPush().catch(() => {});
        clearLoginRedirect();
        clearAuthenticatedUser();
        void goto("/login", { replaceState: true });
      }
      if (event === "SIGNED_IN" && session?.user) {
        loadAuthenticatedUser(session.user);
        if (page.url.pathname === "/login") {
          void goto(consumeLoginRedirect(page.url), { replaceState: true });
        }
      }
    });

    const bootstrapRevision = authRevision;
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    // A sign-in (or sign-out) landed while getUser() was in flight — its result
    // is authoritative, so discard this now-stale bootstrap snapshot.
    if (bootstrapRevision !== authRevision) return;

    if (userError || !authUser) {
      clearAuthenticatedUser();
    } else {
      loadAuthenticatedUser(authUser);
    }

    if (!authUser && !isPublicRoute) {
      redirectToLogin();
    }
  });
</script>

<Toaster richColors position="bottom-right" />
<OfflineIndicator />
<QueryClientProvider client={queryClient}>
  {#if !canRenderProtectedRoute}
    <main class="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div class="text-center">
        <p class="text-base font-semibold tracking-tight text-slate-100">{m.app_name()}</p>
        <div class="mx-auto mt-4 h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div class="bg-accent-gradient h-full w-1/2 animate-pulse rounded-full"></div>
        </div>
      </div>
    </main>
  {:else if !isPublicRoute}
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
    <main class="mobile-page-bottom min-h-screen bg-slate-950 pt-14 md:pb-6">
      <Breadcrumbs />
      {#key page.url.pathname}
        <div in:fade={{ duration: motionDuration(140) }}>
          {@render children()}
        </div>
      {/key}
    </main>
  {:else}
    {@render children()}
  {/if}
</QueryClientProvider>
