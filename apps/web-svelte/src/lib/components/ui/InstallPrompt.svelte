<script lang="ts">
  import { onMount } from "svelte";
  import { trackOnce } from "$lib/analytics";
  import * as m from "$lib/paraglide/messages";

  // Not in the TS DOM lib yet - minimal shape of the Chromium install event.
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }

  const STORAGE_KEY = "pwa_install_prompted_at";
  const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

  let deferred = $state<BeforeInstallPromptEvent | null>(null);
  let isIOS = $state(false);
  // Hidden until onMount confirms the app is installable and not already installed.
  let dismissed = $state(true);

  const show = $derived(!dismissed && (deferred !== null || isIOS));

  function isStandalone(): boolean {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  }

  function recentlyPrompted(): boolean {
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY)) || 0;
      return last > 0 && Date.now() - last < COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  function dismiss(): void {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable (private mode) - fall back to in-memory only.
    }
    dismissed = true;
  }

  onMount(() => {
    // Already installed, or shown recently - stay quiet.
    if (isStandalone() || recentlyPrompted()) return;
    dismissed = false;

    const ua = navigator.userAgent;
    // iOS Safari never fires beforeinstallprompt - it needs manual "Add to Home Screen".
    // Exclude in-app browsers (Chrome/Firefox/Edge on iOS) which cannot install either.
    isIOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      trackOnce("pwa_installed");
      dismiss();
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  });

  async function install(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    deferred = null;
    dismiss();
  }
</script>

{#if show}
  <div
    class="fixed inset-x-0 bottom-(--mobile-action-bottom) z-40 flex justify-center px-4"
    role="region"
    aria-label={m.pwa_install_text()}
  >
    <div
      class="flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <img src="/icon-192x192.png" alt="" class="h-9 w-9 shrink-0 rounded-lg" />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-slate-100">{m.pwa_install_text()}</p>
        {#if isIOS && !deferred}
          <p class="mt-0.5 text-xs text-slate-400">{m.pwa_install_ios_hint()}</p>
        {/if}
      </div>
      {#if deferred}
        <button
          type="button"
          onclick={install}
          class="bg-accent-gradient shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 transition-transform hover:brightness-110"
        >
          {m.pwa_install_cta()}
        </button>
      {/if}
      <button
        type="button"
        onclick={dismiss}
        class="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:text-white"
        aria-label={m.common_close()}
      >
        ✕
      </button>
    </div>
  </div>
{/if}
