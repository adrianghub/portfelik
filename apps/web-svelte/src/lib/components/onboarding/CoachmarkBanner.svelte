<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    message: string;
    dismissLabel: string;
    ondismiss: () => void;
    children?: Snippet;
  }

  let { message, dismissLabel, ondismiss, children }: Props = $props();
</script>

<div
  class="flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
  role="status"
>
  <div class="min-w-0 space-y-1">
    <p class="text-sm text-slate-300">{message}</p>
    {@render children?.()}
  </div>
  <button
    type="button"
    onclick={ondismiss}
    class="focus-visible:ring-accent shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
  >
    {dismissLabel}
  </button>
</div>
