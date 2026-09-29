<script lang="ts">
  import { Download, MoreHorizontal, Plus } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
    onmanualadd: () => void;
  }

  let { exportDisabled, onexport, onmanualadd }: Props = $props();

  let menu = $state<HTMLDetailsElement | null>(null);

  function closeMenu() {
    if (menu) menu.open = false;
  }
</script>

<details bind:this={menu} class="relative shrink-0">
  <summary
    class="focus-visible:ring-accent flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none sm:h-9 sm:w-9 [&::-webkit-details-marker]:hidden"
    aria-label={m.transactions_more_actions()}
  >
    <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
  </summary>
  <div
    class="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-lg backdrop-blur"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/5 md:hidden"
      onclick={() => {
        closeMenu();
        onmanualadd();
      }}
    >
      <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
      {m.transaction_manual_add()}
    </button>
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={exportDisabled}
      onclick={() => {
        closeMenu();
        onexport();
      }}
    >
      <Download size={15} strokeWidth={1.8} aria-hidden="true" />
      {m.csv_export()}
    </button>
  </div>
</details>
