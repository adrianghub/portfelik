<script lang="ts">
  import { Download, Landmark } from "lucide-svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
    variant?: "desktop" | "mobile";
  }

  let { exportDisabled, onexport, variant = "desktop" }: Props = $props();

  let open = $state(false);

  function runExport() {
    onexport();
    open = false;
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";
  const desktopActionClass =
    "focus-visible:ring-accent hidden h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex";
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

{#if variant === "desktop"}
  <div class="hidden shrink-0 items-center gap-2 md:flex">
    <a href="/transactions/import" class={desktopActionClass}>
      <Landmark size={15} strokeWidth={1.8} aria-hidden="true" />
      {m.bank_import_entry()}
    </a>
    <button type="button" class={desktopActionClass} disabled={exportDisabled} onclick={runExport}>
      <Download size={15} strokeWidth={1.8} aria-hidden="true" />
      {m.csv_export()}
    </button>
  </div>
{:else}
  <div class="shrink-0 md:hidden">
    <button
      type="button"
      onclick={() => (open = true)}
      class="focus-visible:ring-accent flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Landmark size={14} strokeWidth={1.8} aria-hidden="true" />
      {m.bank_import_entry()}
    </button>
  </div>
  <Sheet {open} onclose={() => (open = false)} title={m.transactions_more_actions()}>
    {@render items()}
  </Sheet>
{/if}
