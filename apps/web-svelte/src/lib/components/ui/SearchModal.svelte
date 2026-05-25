<script lang="ts">
  import { Search, X } from "lucide-svelte";
  import { tick, type Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    open: boolean;
    onclose: () => void;
    value: string;
    onsearchchange: (q: string) => void;
    children?: Snippet;
  }

  let { open, onclose, value, onsearchchange, children }: Props = $props();
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
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-4 py-[10vh]"
    role="presentation"
    onclick={onclose}
  >
    <div
      class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      transition:fade={{ duration: motionDuration(160) }}
    ></div>
    <div
      class="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-[0_0_60px_rgba(15,23,42,0.65)]"
      role="search"
      aria-label={m.transactions_search_open()}
      transition:fly={{ duration: motionDuration(160), y: -8 }}
      onclick={(e) => e.stopPropagation()}
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
        <button
          type="button"
          onclick={onclose}
          class="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          aria-label={m.transactions_search_close()}
        >
          {m.transactions_search_esc()}
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
