<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";

  interface Props {
    open: boolean;
    onclose: () => void;
    title?: string;
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
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
  >
    <div
      class="w-full max-w-lg overflow-hidden rounded-t-2xl border border-white/5 bg-slate-900/95 shadow-[0_-12px_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : undefined}
    >
      <div class="flex justify-center pt-3 pb-1">
        <div class="h-1 w-10 rounded-full bg-white/15"></div>
      </div>

      {#if title}
        <div class="flex items-center justify-between border-b border-white/5 px-5 py-3">
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

      <div class="px-5 py-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
