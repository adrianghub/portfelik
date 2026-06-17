<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency } from "$lib/utils";

  interface Props {
    live: number;
    forecast: number;
    hasAnchor: boolean;
  }
  let { live, forecast, hasAnchor }: Props = $props();

  const showForecast = $derived(Math.abs(forecast - live) >= 0.01);
</script>

<section
  class="flex items-baseline justify-between rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3"
  aria-label={m.cash_position_label()}
>
  <div class="min-w-0">
    <p class="text-eyebrow text-slate-400">{m.cash_position_label()}</p>
    {#if hasAnchor}
      <p class="text-2xl font-semibold tabular-nums text-slate-100">{formatCurrency(live)}</p>
    {:else}
      <p class="mt-1 text-xs text-slate-400">{m.cash_position_set_hint()}</p>
    {/if}
  </div>
  {#if hasAnchor && showForecast}
    <p class="text-xs text-slate-400 tabular-nums">
      {m.cash_position_forecast({ amount: formatCurrency(forecast) })}
    </p>
  {/if}
</section>
