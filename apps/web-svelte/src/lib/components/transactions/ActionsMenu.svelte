<script lang="ts">
  import { Download, Landmark, MoreVertical } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
  }

  let { exportDisabled, onexport }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let open = $state(false);

  function runExport() {
    onexport();
    open = false;
  }

  function clickOutside(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-actions-menu]")) open = false;
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";
</script>

{#snippet items()}
  <div class="space-y-0.5">
    <a href="/transactions/import" class={itemClass} onclick={() => (open = false)}>
      <Landmark size={16} strokeWidth={1.8} aria-hidden="true" />
      {m.bank_import_entry()}
    </a>
    <button type="button" class={itemClass} disabled={exportDisabled} onclick={runExport}>
      <Download size={16} strokeWidth={1.8} aria-hidden="true" />
      {m.csv_export()}
    </button>
  </div>
{/snippet}

<svelte:window onclick={clickOutside} />

<div class="relative" data-actions-menu>
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={m.transactions_more_actions()}
  >
    <MoreVertical size={16} strokeWidth={1.8} aria-hidden="true" />
  </button>

  {#if open && isDesktop.current}
    <div
      class="absolute top-11 right-0 z-50 w-52 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-2 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="menu"
      aria-label={m.transactions_more_actions()}
    >
      {@render items()}
    </div>
  {/if}
</div>

{#if !isDesktop.current}
  <Sheet {open} onclose={() => (open = false)} title={m.transactions_more_actions()}>
    {@render items()}
  </Sheet>
{/if}
