<script lang="ts">
  import type { Snippet } from "svelte";

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
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
  >
    <div
      class="w-full max-w-lg rounded-t-xl bg-white shadow-xl dark:bg-slate-800"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : undefined}
    >
      <div class="flex justify-center pt-3 pb-1">
        <div class="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
      </div>

      {#if title}
        <div
          class="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700"
        >
          <h2 id="sheet-title" class="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onclick={onclose}
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-400"
            aria-label="Zamknij"
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
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      {/if}

      <div class="px-5 py-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
