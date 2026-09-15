<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import { registerNativeOverlayCloser } from "$lib/services/native-overlay";

  interface Props {
    open: boolean;
    onclose: () => void;
    title: string;
    children: Snippet;
  }
  let { open, onclose, title, children }: Props = $props();

  function onbackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  $effect(() => {
    if (!open) return;
    return registerNativeOverlayCloser(onclose);
  });
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:pb-0"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
  >
    <div
      class="flex max-h-[min(85dvh,640px)] w-full max-w-md flex-col overflow-visible rounded-2xl border border-white/5 bg-slate-900/95 shadow-[0_0_60px_rgba(16,185,129,0.08)] backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b border-white/5 px-5 pt-5 pb-3"
      >
        <h2 id="dialog-title" class="text-base font-semibold text-slate-100">
          {title}
        </h2>
        <button
          onclick={onclose}
          class="focus-visible:ring-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.common_close()}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <div class="min-h-0 overflow-x-visible overflow-y-auto overscroll-contain px-5 py-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
