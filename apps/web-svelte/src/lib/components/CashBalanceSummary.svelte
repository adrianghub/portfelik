<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { cashForecastHorizonEnd } from "$lib/services/cash-position";
  import { formatCurrency, formatDate } from "$lib/utils";

  let {
    live,
    forecast,
    upcomingIncome = 0,
    upcomingExpenses = 0,
    anchorDate,
  }: {
    live: number;
    forecast: number;
    upcomingIncome?: number;
    upcomingExpenses?: number;
    anchorDate?: string;
  } = $props();
</script>

<div class="grid gap-4 sm:grid-cols-2 sm:gap-6">
  <div class="min-w-0">
    <p class="text-sm font-medium text-slate-300">{m.cash_position_label()}</p>
    <p class="mt-1 text-3xl font-semibold tracking-tight text-slate-100 tabular-nums">
      {formatCurrency(live)}
    </p>
    <p class="mt-1 text-xs text-slate-400">{m.cash_position_recorded_hint()}</p>
  </div>
  <div class="min-w-0 border-t border-white/5 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
    <p class="text-sm font-medium text-slate-300">{m.cash_position_forecast_result()}</p>
    <p class="mt-1 text-2xl font-semibold tracking-tight text-slate-100 tabular-nums">
      {formatCurrency(forecast)}
    </p>
    <p class="mt-1 text-xs text-slate-400">
      {m.cash_position_horizon({ date: formatDate(cashForecastHorizonEnd()) })}
    </p>
  </div>
</div>
<details class="mt-3 border-t border-white/5 pt-1">
  <summary
    class="focus-visible:ring-accent min-h-11 cursor-pointer content-center text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
    >{m.cash_position_calculation_title()}</summary
  >
  <p class="mb-3 text-xs leading-relaxed text-slate-400">
    {m.cash_position_scope_hint()}
    {#if anchorDate}{m.cash_position_anchor_hint({ date: formatDate(anchorDate) })}{/if}
  </p>
  <dl class="space-y-2 text-sm">
    <div class="flex items-baseline justify-between gap-3">
      <dt class="text-slate-400">{m.cash_position_label()}</dt>
      <dd class="text-slate-100 tabular-nums">{formatCurrency(live)}</dd>
    </div>
    <div class="flex items-baseline justify-between gap-3">
      <dt class="text-slate-400">{m.cash_position_upcoming_in()}</dt>
      <dd class="text-emerald-300 tabular-nums">+{formatCurrency(upcomingIncome)}</dd>
    </div>
    <div class="flex items-baseline justify-between gap-3">
      <dt class="text-slate-400">{m.cash_position_upcoming_out()}</dt>
      <dd class="text-rose-300 tabular-nums">−{formatCurrency(upcomingExpenses)}</dd>
    </div>
    <div class="flex items-baseline justify-between gap-3 border-t border-white/5 pt-2">
      <dt class="font-medium text-slate-300">{m.cash_position_forecast_result()}</dt>
      <dd class="font-semibold text-slate-100 tabular-nums">{formatCurrency(forecast)}</dd>
    </div>
  </dl>
</details>
