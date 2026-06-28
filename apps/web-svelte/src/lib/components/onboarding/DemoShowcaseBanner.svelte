<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";

  interface Props {
    onclear: () => void;
    clearing?: boolean;
    class?: string;
  }

  let { onclear, clearing = false, class: className = "" }: Props = $props();
</script>

<div
  class={cn(
    "flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
    className
  )}
  role="status"
>
  <p class="text-sm font-medium text-amber-100">{m.demo_banner_title()}</p>
  <div class="flex flex-wrap items-center gap-2">
    <button
      type="button"
      class="rounded-full border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15 disabled:opacity-50"
      disabled={clearing}
      onclick={onclear}
    >
      {m.demo_banner_clear()}
    </button>
    <a
      href="/import"
      class="bg-accent-gradient rounded-full px-3 py-1.5 text-xs font-semibold text-slate-900"
    >
      {m.demo_banner_import()}
    </a>
  </div>
</div>
