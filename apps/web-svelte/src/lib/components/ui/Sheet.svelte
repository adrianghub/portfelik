<script module lang="ts">
  let openSheetCount = 0;

  function syncMobileOverlayClass() {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("mobile-overlay-open", openSheetCount > 0);
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";
  import { fade, fly } from "svelte/transition";
  import { motionDuration } from "$lib/motion";

  interface Props {
    open: boolean;
    onclose: () => void;
    title?: string;
    /** id of an external element that labels the dialog when `title` is omitted. */
    labelledBy?: string;
    /** Skip body padding — for panels that bring their own full-bleed header/list chrome. */
    flush?: boolean;
    children: Snippet;
  }

  let { open, onclose, title, labelledBy, flush = false, children }: Props = $props();

  function onbackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  $effect(() => {
    if (!open || typeof document === "undefined") return;
    openSheetCount += 1;
    syncMobileOverlayClass();
    return () => {
      openSheetCount = Math.max(0, openSheetCount - 1);
      syncMobileOverlayClass();
    };
  });
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    use:portal
    class="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
    transition:fade={{ duration: motionDuration(140) }}
  >
    <div
      class="flex max-h-[min(90dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/5 bg-slate-900/95 shadow-[0_-12px_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : labelledBy}
      transition:fly={{ y: "100%", duration: motionDuration(220), opacity: 1 }}
    >
      <div class="flex shrink-0 justify-center pt-3 pb-1">
        <button
          type="button"
          onclick={onclose}
          class="group -my-2 rounded-full px-8 py-3 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          aria-label="Zamknij"
        >
          <span
            class="block h-1 w-10 rounded-full bg-white/20 transition-all group-hover:w-12 group-hover:bg-white/35 group-active:translate-y-1 group-active:bg-white/45"
          ></span>
        </button>
      </div>

      {#if title}
        <div class="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 id="sheet-title" class="text-base font-semibold text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onclick={onclose}
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label="Zamknij"
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      {/if}

      <div
        class={flush
          ? "min-h-0 flex-1 overflow-hidden"
          : "min-h-0 flex-1 overflow-y-auto px-5 py-4"}
      >
        {@render children()}
      </div>
    </div>
  </div>
{/if}
