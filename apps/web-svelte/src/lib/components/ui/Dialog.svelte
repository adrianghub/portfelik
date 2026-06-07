<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";

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
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
  >
    <div
      class="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col overflow-visible rounded-2xl border border-white/5 bg-slate-900/95 shadow-[0_0_60px_rgba(16,185,129,0.08)] backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div class="flex shrink-0 items-center justify-between border-b border-white/5 px-5 pt-5 pb-3">
        <h2 id="dialog-title" class="text-base font-semibold text-slate-100">
          {title}
        </h2>
        <button
          onclick={onclose}
          class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          aria-label={m.common_close()}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <div class="overflow-x-visible overflow-y-auto px-5 py-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
