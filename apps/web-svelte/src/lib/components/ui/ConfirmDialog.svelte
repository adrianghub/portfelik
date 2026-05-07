<script lang="ts">
  import * as m from "$lib/paraglide/messages";

  interface Props {
    open: boolean;
    message: string;
    onconfirm: () => void;
    onclose: () => void;
    pending?: boolean;
  }
  let { open, message, onconfirm, onclose, pending = false }: Props = $props();

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  function onbackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
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
      class="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900"
      role="alertdialog"
      aria-modal="true"
    >
      <h2 class="text-base font-semibold text-zinc-900 dark:text-white">{m.common_confirm_delete()}</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      <div class="flex gap-2">
        <button
          onclick={onclose}
          class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {m.common_cancel()}
        </button>
        <button
          onclick={onconfirm}
          disabled={pending}
          class="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? m.common_saving() : m.common_delete()}
        </button>
      </div>
    </div>
  </div>
{/if}
