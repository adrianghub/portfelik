<script lang="ts">
  import { errorMessage } from "$lib/services/supabase-errors";
  import * as m from "$lib/paraglide/messages";

  let { error, onRetry }: { error: unknown; onRetry?: () => void } = $props();
</script>

<div class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
  <p class="text-sm text-rose-300">{errorMessage(error)}</p>
  {#if onRetry}
    <button
      type="button"
      onclick={onRetry}
      class="focus-visible:ring-accent mt-2 rounded-full border border-white/10 bg-slate-900/60 px-4 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.common_retry()}
    </button>
  {/if}
</div>
