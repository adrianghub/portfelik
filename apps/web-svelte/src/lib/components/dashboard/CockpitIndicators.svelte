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

{#snippet dial(
  label: string,
  period: string,
  value: string,
  tone: "balance" | "payments" | "forecast"
)}
  <div class="flex w-full min-w-0 flex-col items-center text-center">
    <svg
      viewBox="0 0 120 64"
      class="mb-2 block aspect-[15/8] w-full max-w-24 {tone === 'payments'
        ? 'text-amber-400'
        : tone === 'forecast'
          ? 'text-lime-400'
          : 'text-emerald-400'}"
      aria-hidden="true"
    >
      {#if tone === "balance"}
        <defs>
          <linearGradient id="cockpit-arc-balance" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#2dd4bf" />
            <stop offset="100%" stop-color="#34d399" />
          </linearGradient>
        </defs>
      {/if}
      <path
        d="M 10 58 A 50 50 0 0 1 110 58"
        fill="none"
        stroke={tone === "balance" ? "url(#cockpit-arc-balance)" : "currentColor"}
        stroke-width="8"
        stroke-linecap="round"
      />
    </svg>
    <p class="w-full min-w-0 text-sm font-medium wrap-anywhere text-slate-300">{label}</p>
    <p
      class="mt-1 w-full min-w-0 text-xl font-semibold tracking-tight wrap-anywhere text-slate-100 tabular-nums md:text-2xl"
    >
      {value}
    </p>
    {#if period}
      <p class="mt-1 max-w-full text-xs wrap-anywhere text-slate-400">{period}</p>
    {/if}
  </div>
{/snippet}

<div
  class="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:grid-cols-3"
  data-testid="cockpit-indicators"
>
  <div
    class="order-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 md:order-1"
    data-testid="cockpit-balance"
    role="group"
    aria-label="{m.cockpit_balance_label()}: {amountOrMissing(balance)}"
  >
    {@render dial(m.cockpit_balance_label(), "", amountOrMissing(balance), "balance")}
  </div>

  <div
    class="order-3 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 md:order-2"
    data-testid="cockpit-payments"
    role="group"
    aria-label="{m.cockpit_payments_label()}: {formatCurrency(payments30)}"
  >
    {@render dial(
      m.cockpit_payments_label(),
      m.cockpit_payments_window(),
      formatCurrency(payments30),
      "payments"
    )}
    {#if overdue > 0}
      <p class="mt-1 text-center text-xs text-rose-300">
        {m.cockpit_overdue({ amount: formatCurrency(overdue) })}
      </p>
    {/if}
    {#if orientational30 > 0}
      <p class="mt-1 text-center text-xs text-slate-400">
        {m.cockpit_orientational({ amount: formatCurrency(orientational30) })}
      </p>
    {/if}
  </div>

  <div
    class="order-1 col-span-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 max-[359px]:col-span-1 md:order-3 md:col-span-1"
    data-testid="cockpit-forecast"
    role="group"
    aria-label="{m.cockpit_forecast_label()}: {amountOrMissing(forecast30)}"
  >
    {@render dial(
      m.cockpit_forecast_label(),
      m.cockpit_forecast_until({ date: calendarDate(forecastDate) }),
      amountOrMissing(forecast30),
      "forecast"
    )}
  </div>
</div>
