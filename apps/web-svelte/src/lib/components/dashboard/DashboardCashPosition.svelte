<script lang="ts">
  import { ArrowRight } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency } from "$lib/utils";

  let {
    live,
    forecast,
    hasAnchor,
    loading = false,
  }: {
    live: number;
    forecast: number;
    hasAnchor: boolean;
    loading?: boolean;
  } = $props();
</script>

{#if loading}
  <div
    class="h-32 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"
    aria-hidden="true"
  ></div>
{:else if hasAnchor}
  <a
    href="/transactions?group=own"
    class="focus-visible:ring-accent group block rounded-2xl border border-white/5 bg-slate-900/60 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)] backdrop-blur transition-colors hover:border-white/10 hover:bg-slate-900/75 focus-visible:ring-2 focus-visible:outline-none sm:p-5"
    aria-label={`${m.dashboard_cash_now()}: ${formatCurrency(live)}. ${m.dashboard_cash_after_upcoming()}: ${formatCurrency(forecast)}`}
    data-testid="dashboard-cash-position"
  >
    <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
      <div class="min-w-0">
        <p class="text-eyebrow text-slate-400">{m.dashboard_cash_now()}</p>
        <p
          class="mt-1 text-3xl font-semibold tracking-tight text-slate-100 tabular-nums sm:text-4xl"
        >
          {formatCurrency(live)}
        </p>
      </div>

      <ArrowRight
        size={20}
        strokeWidth={1.6}
        class="text-accent hidden transition-transform group-hover:translate-x-0.5 sm:block"
        aria-hidden="true"
      />

      <div class="min-w-0 border-t border-white/5 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
        <p class="text-eyebrow text-slate-400">{m.dashboard_cash_after_upcoming()}</p>
        <p
          class="mt-1 text-2xl font-semibold tracking-tight text-slate-100 tabular-nums sm:text-3xl"
        >
          {formatCurrency(forecast)}
        </p>
        <p class="mt-1 text-xs text-slate-500">{m.cash_position_scope_hint()}</p>
      </div>
    </div>
  </a>
{:else}
  <a
    href="/transactions?group=own"
    class="focus-visible:ring-accent flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-slate-900/60 focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.cash_position_set_hint()}
    <ArrowRight size={17} strokeWidth={1.8} class="text-accent shrink-0" aria-hidden="true" />
  </a>
{/if}
