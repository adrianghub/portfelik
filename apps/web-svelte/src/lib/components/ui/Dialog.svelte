<script lang="ts">
  import type { Snippet } from "svelte";
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
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
  >
    <div
      class="w-full max-w-md rounded-2xl bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div class="flex items-center justify-between border-b border-zinc-100 px-5 pt-5 pb-3">
        <h2 id="dialog-title" class="text-base font-semibold text-zinc-900">{title}</h2>
        <button
          onclick={onclose}
          class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label={m.common_close()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
          >
        </button>
      </div>
      <div class="px-5 py-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
