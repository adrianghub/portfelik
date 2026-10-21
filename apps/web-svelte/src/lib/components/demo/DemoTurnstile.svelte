<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    siteKey: string;
    onToken: (token: string) => void;
    onError: () => void;
  }
  let { siteKey, onToken, onError }: Props = $props();
  let container: HTMLDivElement;

  type Turnstile = {
    render: (container: HTMLElement, options: Record<string, unknown>) => string;
    remove: (id: string) => void;
  };

  onMount(() => {
    const browser = window as Window & { turnstile?: Turnstile };
    let disposed = false;
    let widgetId: string | undefined;
    const fail = () => {
      if (disposed) return;
      onToken("");
      onError();
    };
    const render = () => {
      if (disposed || widgetId !== undefined) return;
      if (!browser.turnstile) return fail();
      try {
        widgetId = browser.turnstile.render(container, {
          sitekey: siteKey,
          theme: "dark",
          size: "flexible",
          callback: (token: string) => {
            if (!disposed) onToken(token);
          },
          "expired-callback": () => {
            if (!disposed) onToken("");
          },
          "error-callback": fail,
          "timeout-callback": fail,
        });
      } catch {
        fail();
      }
    };

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
      script.removeEventListener("load", render);
      script.removeEventListener("error", fail);
      if (widgetId !== undefined) browser.turnstile?.remove(widgetId);
    };
  });
</script>

<div class="mb-3 min-h-16 w-full" bind:this={container}></div>
