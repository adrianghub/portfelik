<script lang="ts">
  import { Download, Landmark } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
  }

  let { exportDisabled, onexport }: Props = $props();

  const pill =
    "focus-visible:ring-accent flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";
</script>

<div class="flex shrink-0 items-center gap-2">
  <a href="/transactions/import" class={pill}>
    <Landmark size={15} strokeWidth={1.8} aria-hidden="true" />
    {m.bank_import_short()}
  </a>
  <button type="button" class={pill} disabled={exportDisabled} onclick={onexport}>
    <Download size={15} strokeWidth={1.8} aria-hidden="true" />
    {m.csv_export()}
  </button>
</div>
