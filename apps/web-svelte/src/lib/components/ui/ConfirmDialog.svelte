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
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
  >
    <div
      class="w-full max-w-sm space-y-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-5 shadow-[0_0_60px_rgba(244,63,94,0.12)] backdrop-blur"
      role="alertdialog"
      aria-modal="true"
    >
      <h2 class="text-base font-semibold text-slate-100">
        {m.common_confirm_delete()}
      </h2>
      <p class="text-sm text-slate-400">{message}</p>
      <div class="flex gap-2">
        <button
          onclick={onclose}
          class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
        >
          {m.common_cancel()}
        </button>
        <button
          onclick={onconfirm}
          disabled={pending}
          class="flex-1 rounded-full border border-rose-400/20 bg-rose-500/15 py-2 text-sm font-semibold text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.25)] backdrop-blur transition-colors hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? m.common_saving() : m.common_delete()}
        </button>
      </div>
    </div>
  </div>
{/if}
