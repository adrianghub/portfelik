<script lang="ts">
  import { Landmark, Download } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
  }

  let { exportDisabled, onexport }: Props = $props();

  const importPill =
    "focus-visible:ring-accent bg-accent-gradient flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none";
  const importIconOnly =
    "focus-visible:ring-accent bg-accent-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none sm:hidden";
  const secondaryPill =
    "focus-visible:ring-accent flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";
  const secondaryIconOnly =
    "focus-visible:ring-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:hidden";
</script>

<div class="flex shrink-0 items-center gap-2">
  <a
    href="/import"
    class={importIconOnly}
    title={m.bank_import_short()}
    aria-label={m.bank_import_short()}
  >
    <Landmark size={15} strokeWidth={1.8} aria-hidden="true" />
  </a>
  <a href="/import" class="{importPill} hidden sm:inline-flex">
    <Landmark size={15} strokeWidth={1.8} aria-hidden="true" />
    {m.bank_import_short()}
  </a>
  <button
    type="button"
    class={secondaryIconOnly}
    disabled={exportDisabled}
    onclick={onexport}
    title={m.csv_export()}
    aria-label={m.csv_export()}
  >
    <Download size={15} strokeWidth={1.8} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="{secondaryPill} hidden sm:inline-flex"
    disabled={exportDisabled}
    onclick={onexport}
  >
    <Download size={15} strokeWidth={1.8} aria-hidden="true" />
    {m.csv_export()}
  </button>
</div>
