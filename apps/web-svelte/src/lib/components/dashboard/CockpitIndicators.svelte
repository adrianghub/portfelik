<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency } from "$lib/utils";

  let {
    balance,
    expenses,
    forecast,
    orientational = 0,
  }: {
    balance: number | null;
    expenses: number | null;
    forecast: number | null;
    orientational?: number;
  } = $props();

  function visibleAmount(amount: number | null): string {
    return amount === null ? "-" : formatCurrency(amount);
  }

  function accessibleAmount(amount: number | null): string {
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
    aria-label="{m.cockpit_balance_label()}: {accessibleAmount(balance)}"
  >
    {@render dial(m.cockpit_balance_label(), "", visibleAmount(balance), "balance")}
  </div>

  <div
    class="order-3 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 md:order-2"
    data-testid="cockpit-payments"
    role="group"
    aria-label="{m.cockpit_payments_label()}: {accessibleAmount(expenses)}"
  >
    {@render dial(m.cockpit_payments_label(), "", visibleAmount(expenses), "payments")}
    {#if orientational > 0}
      <p class="mt-1 text-center text-xs text-slate-400">
        {m.cockpit_orientational({ amount: formatCurrency(orientational) })}
      </p>
    {/if}
  </div>

  <div
    class="order-1 col-span-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 max-[359px]:col-span-1 md:order-3 md:col-span-1"
    data-testid="cockpit-forecast"
    role="group"
    aria-label="{m.cockpit_forecast_label()}: {accessibleAmount(forecast)}"
  >
    {@render dial(m.cockpit_forecast_label(), "", visibleAmount(forecast), "forecast")}
  </div>
</div>
