<script lang="ts">
  import { onMount } from "svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    siteKey: string;
    onToken: (token: string) => void;
    onError: () => void;
  }
  let { siteKey, onToken, onError }: Props = $props();
  let container: HTMLDivElement;
  let retryChallenge = $state<(() => void) | undefined>(undefined);
  let needsRetry = $state(false);

  type Turnstile = {
    render: (container: HTMLElement, options: Record<string, unknown>) => string;
    remove: (id: string) => void;
  };

  onMount(() => {
    const browser = window as Window & { turnstile?: Turnstile };
    let disposed = false;
    let widgetId: string | undefined;
    let widgetSize: string | undefined;
    let script: HTMLScriptElement | null = null;
    const fail = () => {
      if (disposed) return;
      onToken("");
      needsRetry = true;
      onError();
    };
    const render = () => {
      if (disposed || widgetId !== undefined) return;
      if (!browser.turnstile) return fail();
      try {
        widgetSize = container.clientWidth < 300 ? "compact" : "flexible";
        needsRetry = false;
        widgetId = browser.turnstile.render(container, {
          sitekey: siteKey,
          theme: "dark",
          size: widgetSize,
          retry: "never",
          "refresh-expired": "manual",
          callback: (token: string) => {
            if (!disposed) {
              needsRetry = false;
              onToken(token);
            }
          },
          "expired-callback": () => {
            if (!disposed) {
              onToken("");
              needsRetry = true;
            }
          },
          "error-callback": fail,
          "timeout-callback": fail,
        });
      } catch {
        fail();
      }
    };
    const scriptFailed = () => {
      if (disposed) return;
      if (script) script.dataset.demoTurnstileState = "failed";
      script?.remove();
      fail();
    };
    const scriptLoaded = () => {
      if (disposed) return;
      if (!browser.turnstile) return scriptFailed();
      if (script) script.dataset.demoTurnstileState = "loaded";
      render();
    };
    const detachScript = () => {
      script?.removeEventListener("load", scriptLoaded);
      script?.removeEventListener("error", scriptFailed);
    };
    const loadScript = () => {
      script = document.querySelector<HTMLScriptElement>("script[data-demo-turnstile]");
      // A completed/failed tag cannot emit a second load event on SPA re-entry.
      if (script && script.dataset.demoTurnstileState !== "loading") {
        script.remove();
        script = null;
      }
      const append = !script;
      if (!script) {
        script = document.createElement("script");
        script.dataset.demoTurnstile = "true";
        script.dataset.demoTurnstileState = "loading";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
      }
      script.addEventListener("load", scriptLoaded);
      script.addEventListener("error", scriptFailed);
      if (append) document.head.appendChild(script);
    };
    const rerender = () => {
      if (disposed) return;
      if (!browser.turnstile) {
        needsRetry = false;
        onToken("");
        detachScript();
        script?.remove();
        loadScript();
        return;
      }
      if (widgetId !== undefined) browser.turnstile.remove(widgetId);
      widgetId = undefined;
      onToken("");
      render();
    };
    retryChallenge = rerender;
    const observer = new ResizeObserver(() => {
      const size = container.clientWidth < 300 ? "compact" : "flexible";
      if (widgetId !== undefined && size !== widgetSize) rerender();
    });
    observer.observe(container);

    if (browser.turnstile) render();
    else loadScript();

    return () => {
      disposed = true;
      observer.disconnect();
      retryChallenge = undefined;
      detachScript();
      // Navigation before load/error must not leave an abandoned pending tag.
      if (!browser.turnstile) script?.remove();
      if (widgetId !== undefined) browser.turnstile?.remove(widgetId);
    };
  });
</script>

<div class="mb-3 min-h-16 w-full" bind:this={container}></div>
{#if needsRetry}
  <button
    type="button"
    onclick={() => retryChallenge?.()}
    class="mb-3 min-h-11 rounded-full border border-white/10 px-4 text-sm text-slate-300"
    >{m.demo_challenge_retry()}</button
  >
{/if}
