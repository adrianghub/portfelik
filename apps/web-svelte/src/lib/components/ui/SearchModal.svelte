<script lang="ts">
  import { Search, X } from "lucide-svelte";
  import { tick } from "svelte";
  import { fly } from "svelte/transition";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    open: boolean;
    onclose: () => void;
    value: string;
    onsearchchange: (q: string) => void;
  }

  let { open, onclose, value, onsearchchange }: Props = $props();
  let inputRef = $state<HTMLInputElement | null>(null);

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  $effect(() => {
    if (!open) return;
    tick().then(() => inputRef?.focus());
  });
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    class="pointer-events-none fixed inset-x-0 top-16 z-40 flex items-start justify-center px-4"
    role="search"
  >
    <div
      class="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-[0_0_60px_rgba(15,23,42,0.65)]"
      aria-label={m.transactions_search_open()}
      transition:fly={{ duration: motionDuration(160), y: -8 }}
    >
      <div class="flex items-center gap-3 px-4 py-3">
        <Search size={18} strokeWidth={1.8} class="shrink-0 text-slate-400" aria-hidden="true" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:this={inputRef}
          type="search"
          autofocus
          {value}
          oninput={(e) => onsearchchange((e.target as HTMLInputElement).value)}
          placeholder={m.transactions_search_placeholder()}
          class="min-w-0 flex-1 bg-transparent text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        {#if value}
          <button
            type="button"
            onclick={() => onsearchchange("")}
            class="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label={m.transactions_search_clear()}
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <div class="border-t border-white/5 px-4 py-2.5">
        <p class="text-xs text-slate-500">{m.transactions_search_hint()}</p>
      </div>
    </div>
  </div>
{/if}
