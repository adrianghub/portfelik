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
    const rerender = () => {
      if (disposed) return;
      if (!browser.turnstile) {
        needsRetry = false;
        onToken("");
        script?.removeEventListener("load", render);
        script?.removeEventListener("error", fail);
        script?.remove();
        script = document.createElement("script");
        script.dataset.demoTurnstile = "true";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.addEventListener("load", render);
        script.addEventListener("error", fail);
        document.head.appendChild(script);
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

    let script = document.querySelector<HTMLScriptElement>("script[data-demo-turnstile]");
    if (!script) {
      script = document.createElement("script");
      script.dataset.demoTurnstile = "true";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    script.addEventListener("error", fail);
    if (browser.turnstile) render();

    return () => {
      disposed = true;
      observer.disconnect();
      retryChallenge = undefined;
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", fail);
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
