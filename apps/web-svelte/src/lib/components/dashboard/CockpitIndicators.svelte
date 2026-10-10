<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency } from "$lib/utils";

  let {
    balance,
    payments30,
    forecast30,
    forecastDate,
    overdue = 0,
    orientational30 = 0,
  }: {
    balance: number | null;
    payments30: number;
    forecast30: number | null;
    /** Inclusive YYYY-MM-DD the 30-day forecast is calculated through. */
    forecastDate: string;
    overdue?: number;
    orientational30?: number;
  } = $props();

  function calendarDate(iso: string): string {
    const [year, month, day] = iso.slice(0, 10).split("-");
    return `${day}.${month}.${year}`;
  }

  function amountOrMissing(amount: number | null): string {
    return amount === null ? m.cockpit_missing() : formatCurrency(amount);
  }
</script>

{#snippet bezel()}
  <svg viewBox="0 0 120 68" class="text-slate-600" aria-hidden="true">
    <path
      d="M 14 60 A 46 46 0 0 1 106 60"
      fill="none"
      stroke="currentColor"
      stroke-width="4"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

<div class="grid grid-cols-2 gap-3 md:grid-cols-3" data-testid="cockpit-indicators">
  <div
    class="order-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 p-3 md:order-1"
    data-testid="cockpit-balance"
    role="group"
    aria-label="{m.cockpit_balance_label()}: {amountOrMissing(balance)}"
  >
    {@render bezel()}
    <p class="text-xs font-medium text-slate-400">{m.cockpit_balance_label()}</p>
    <p class="mt-1 text-xl font-semibold tracking-tight text-slate-100 tabular-nums md:text-2xl">
      {amountOrMissing(balance)}
    </p>
  </div>

  <div
    class="order-3 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 p-3 md:order-2"
    data-testid="cockpit-payments"
    role="group"
    aria-label="{m.cockpit_payments_label()}: {formatCurrency(payments30)}"
  >
    {@render bezel()}
    <p class="text-xs font-medium text-slate-400">{m.cockpit_payments_label()}</p>
    <p class="text-xs text-slate-500">{m.cockpit_payments_window()}</p>
    <p class="mt-1 text-xl font-semibold tracking-tight text-slate-100 tabular-nums md:text-2xl">
      {formatCurrency(payments30)}
    </p>
    {#if overdue > 0}
      <p class="mt-1 text-xs text-rose-300">
        {m.cockpit_overdue({ amount: formatCurrency(overdue) })}
      </p>
    {/if}
    {#if orientational30 > 0}
      <p class="mt-1 text-xs text-slate-400">
        {m.cockpit_orientational({ amount: formatCurrency(orientational30) })}
      </p>
    {/if}
  </div>

  <div
    class="order-1 col-span-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 p-3 md:order-3 md:col-span-1"
    data-testid="cockpit-forecast"
    role="group"
    aria-label="{m.cockpit_forecast_label()}: {amountOrMissing(forecast30)}"
  >
    {@render bezel()}
    <p class="text-xs font-medium text-slate-400">{m.cockpit_forecast_label()}</p>
    <p class="text-xs text-slate-500">
      {m.cockpit_forecast_until({ date: calendarDate(forecastDate) })}
    </p>
    <p class="mt-1 text-2xl font-semibold tracking-tight text-slate-100 tabular-nums">
      {amountOrMissing(forecast30)}
    </p>
  </div>
</div>
