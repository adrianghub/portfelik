<script lang="ts">
  import { Search, X } from "lucide-svelte";
  import { focusFirstInOverlay, trapOverlayTab } from "$lib/focus-trap";
  import { tick, type Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import { hideMobileChrome, registerNativeOverlayCloser } from "$lib/services/native-overlay";

  interface Props {
    open: boolean;
    onclose: () => void;
    value: string;
    onsearchchange: (q: string) => void;
    children?: Snippet;
  }

  let { open, onclose, value, onsearchchange, children }: Props = $props();
  let inputRef = $state<HTMLInputElement | null>(null);
  let panel = $state<HTMLElement | null>(null);

  function onkeydown(e: KeyboardEvent) {
    if (!open || e.defaultPrevented) return;
    const activeOverlay =
      e.target instanceof Element
        ? e.target.closest('[role="dialog"], [role="alertdialog"]')
        : null;
    if (activeOverlay && activeOverlay !== panel) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
      return;
    }
    if (panel) trapOverlayTab(e, panel);
  }

  $effect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tick().then(() => {
      if (open && panel) focusFirstInOverlay(panel);
    });
    const releaseChrome = hideMobileChrome();
    const unregister = registerNativeOverlayCloser(() => onclose());
    return () => {
      unregister();
      releaseChrome();
      queueMicrotask(() => previousFocus?.focus({ preventScroll: true }));
    };
  });
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-3 pt-[calc(var(--safe-top)+0.75rem)] pb-[max(0.75rem,var(--safe-bottom))]"
    role="presentation"
    onclick={(event) => {
      if (
        event.target === event.currentTarget ||
        (event.target instanceof HTMLElement && event.target.hasAttribute("data-search-backdrop"))
      )
        onclose();
    }}
  >
    <div
      data-search-backdrop
      class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      transition:fade={{ duration: motionDuration(160) }}
    ></div>
    <div
      class="relative flex max-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-[0_0_60px_rgba(15,23,42,0.65)]"
      bind:this={panel}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={m.transactions_search_open()}
      transition:fly={{ duration: motionDuration(160), y: -8 }}
    >
      <div class="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <Search size={18} strokeWidth={1.8} class="shrink-0 text-slate-400" aria-hidden="true" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:this={inputRef}
          type="text"
          autofocus
          {value}
          oninput={(e) => onsearchchange((e.target as HTMLInputElement).value)}
          aria-label={m.transactions_search_open()}
          placeholder={m.transactions_search_placeholder()}
          class="min-w-0 flex-1 bg-transparent text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        {#if value}
          <button
            type="button"
            onclick={() => onsearchchange("")}
            class="flex size-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label={m.transactions_search_clear()}
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        {/if}
        <button
          type="button"
          onclick={onclose}
          class="min-h-11 min-w-11 shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          aria-label={m.transactions_search_close()}
        >
          <span class="md:hidden">{m.common_close()}</span>
          <span class="hidden md:inline">{m.transactions_search_esc()}</span>
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
