<script lang="ts">
  import { shortDayMonth } from "$lib/cockpit/month-window";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency } from "$lib/utils";

  let {
    balance,
    expenses,
    forecast,
    orientational = 0,
    expensesFrom = null,
    expensesIncomplete = false,
    onOpenGlossary,
  }: {
    balance: number | null;
    expenses: number | null;
    forecast: number | null;
    orientational?: number;
    /** YYYY-MM-DD when Wydatki start on the anchor inside this window. */
    expensesFrom?: string | null;
    /** Dom and Wszystkie stay blank until every expense source is loaded. */
    expensesIncomplete?: boolean;
    onOpenGlossary?: (entryId: string) => void;
  } = $props();

  const expensesFromLabel = $derived(expensesFrom ? shortDayMonth(expensesFrom) : null);
  const expensesName = $derived(
    expensesFromLabel
      ? `${m.cockpit_payments_label()}: ${accessibleAmount(expenses)}, ${m.cockpit_expenses_from({ date: expensesFromLabel })}`
      : `${m.cockpit_payments_label()}: ${accessibleAmount(expenses)}`
  );
  const expensesHelp = $derived.by(() => {
    const parts: string[] = [];
    if (expensesFromLabel) {
      parts.push(m.cockpit_expenses_from_help({ date: expensesFromLabel }));
    }
    if (orientational > 0) {
      parts.push(m.cockpit_orientational({ amount: formatCurrency(orientational) }));
    }
    if (expensesIncomplete) parts.push(m.cockpit_expenses_incomplete_help());
    if (parts.length === 0) parts.push(m.cockpit_counters_help());
    return parts.join(" ");
  });
  const expensesHelpLabel = $derived(
    expensesFromLabel || expensesIncomplete
      ? expensesFromLabel
        ? m.cockpit_expenses_from_help_label()
        : m.cockpit_expenses_incomplete_help_label()
      : m.cockpit_payments_label()
  );

  function visibleAmount(amount: number | null): string {
    return amount === null ? "-" : formatCurrency(amount);
  }

  function accessibleAmount(amount: number | null): string {
    return amount === null ? m.cockpit_missing() : formatCurrency(amount);
  }
</script>

{#snippet dial(
  label: string,
  value: string,
  tone: "balance" | "payments" | "forecast",
  helpLabel: string,
  helpText: string,
  glossaryEntryId?: string
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
    <div class="mt-1 grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center">
      <span></span>
      <p
        class="min-w-0 text-center text-xl font-semibold tracking-tight wrap-anywhere text-slate-100 tabular-nums md:text-2xl"
      >
        {value}
      </p>
      <span class="justify-self-end">
        <InfoTooltip
          label={helpLabel}
          text={helpText}
          side="top"
          {glossaryEntryId}
          {onOpenGlossary}
        />
      </span>
    </div>
  </div>
{/snippet}

<div
  class="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:grid-cols-3"
  data-testid="cockpit-indicators"
  data-tour-id="tour-balance-ring"
>
  <div
    class="order-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 md:order-1"
    data-testid="cockpit-balance"
    role="group"
    aria-label="{m.cockpit_balance_label()}: {accessibleAmount(balance)}"
  >
    {@render dial(
      m.cockpit_balance_label(),
      visibleAmount(balance),
      "balance",
      m.cockpit_counters_help_label(),
      m.cockpit_counters_help()
    )}
  </div>

  <div
    class="order-3 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 md:order-2"
    data-testid="cockpit-payments"
    role="group"
    aria-label={expensesName}
  >
    {@render dial(
      m.cockpit_payments_label(),
      visibleAmount(expenses),
      "payments",
      expensesHelpLabel,
      expensesHelp
    )}
  </div>

  <div
    class="order-1 col-span-2 min-w-0 rounded-2xl border border-white/5 bg-slate-950/40 px-3 py-3 max-[359px]:col-span-1 md:order-3 md:col-span-1"
    data-testid="cockpit-forecast"
    role="group"
    aria-label="{m.cockpit_forecast_label()}: {accessibleAmount(forecast)}"
  >
    {@render dial(
      m.cockpit_forecast_label(),
      visibleAmount(forecast),
      "forecast",
      m.cockpit_forecast_help_label(),
      m.dashboard_forecast_info(),
      "prognoza"
    )}
  </div>
</div>
