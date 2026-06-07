<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    approximateDailyInterest,
    compareOverpay,
    formatDuration,
  } from "$lib/services/debt-amortization";
  import type { PlanDebtTerms } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import { ChevronRight } from "lucide-svelte";

  interface Props {
    planId: string;
    terms: PlanDebtTerms;
  }

  let { planId, terms }: Props = $props();

  let extraPayment = $state(500);

  const paid = $derived(Math.max(0, terms.original_amount - terms.current_balance));
  const paidPct = $derived(
    terms.original_amount > 0 ? Math.round((paid / terms.original_amount) * 100) : 0
  );
  const dailyInterest = $derived(
    approximateDailyInterest(terms.current_balance, Number(terms.annual_rate))
  );
  const comparison = $derived(
    compareOverpay(
      {
        currentBalance: Number(terms.current_balance),
        annualRate: Number(terms.annual_rate),
        monthlyPayment: Number(terms.monthly_payment),
      },
      extraPayment
    )
  );
</script>

<section class="space-y-5">
  <div
    class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_90%_10%,rgba(45,212,191,0.12),transparent_45%)] p-5"
  >
    <p class="text-eyebrow text-slate-400">{m.plan_debt_remaining_hero()}</p>
    <p class="text-accent mt-2 text-4xl font-semibold tabular-nums">
      {formatCurrency(Number(terms.current_balance))}
    </p>
    <p class="mt-1 text-sm text-slate-400">
      z {formatCurrency(Number(terms.original_amount))}
    </p>
    <div
      class="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"
      role="progressbar"
      aria-valuenow={paidPct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div class="bg-accent-gradient h-full rounded-full" style="width: {paidPct}%"></div>
    </div>
    <p class="mt-2 text-xs text-slate-500">
      {m.plan_debt_card_progress({
        paid: formatCurrency(paid),
        total: formatCurrency(Number(terms.original_amount)),
      })}
    </p>
  </div>

  <div class="grid grid-cols-3 gap-2">
    <div class="rounded-xl border border-white/5 bg-slate-900/50 px-2 py-3 text-center">
      <p class="text-[10px] text-slate-500 uppercase">{m.plan_debt_stats_rate()}</p>
      <p class="mt-1 text-sm font-semibold text-slate-100">{Number(terms.annual_rate)}%</p>
    </div>
    <div class="rounded-xl border border-white/5 bg-slate-900/50 px-2 py-3 text-center">
      <p class="text-[10px] text-slate-500 uppercase">{m.plan_debt_stats_payment()}</p>
      <p class="mt-1 text-sm font-semibold text-slate-100 tabular-nums">
        {formatCurrency(Number(terms.monthly_payment))}
      </p>
    </div>
    <div class="rounded-xl border border-white/5 bg-slate-900/50 px-2 py-3 text-center">
      <p class="text-[10px] text-slate-500 uppercase">{m.plan_debt_stats_daily_interest()}</p>
      <p class="mt-1 text-sm font-semibold text-amber-300 tabular-nums">
        {m.plan_debt_daily_interest_value({ amount: formatCurrency(dailyInterest) })}
      </p>
    </div>
  </div>

  <div class="rounded-2xl border border-white/5 bg-slate-900/50 p-4">
    <p class="text-sm font-medium text-slate-200">{m.plan_debt_overpay_label()}</p>
    <input
      type="range"
      min="0"
      max="2000"
      step="100"
      bind:value={extraPayment}
      class="accent-accent mt-4 w-full"
      aria-valuetext="{extraPayment} zł"
    />
    <div class="mt-2 flex flex-wrap gap-2">
      {#each [0, 300, 500, 1000] as chip (chip)}
        <button
          type="button"
          onclick={() => (extraPayment = chip)}
          class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5"
        >
          {chip === 0 ? m.plan_debt_overpay_none() : `+${chip}`}
        </button>
      {/each}
    </div>
    {#if extraPayment > 0}
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        <div class="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
          <p class="text-xs text-emerald-400">{m.plan_debt_interest_saved()}</p>
          <p class="mt-1 text-lg font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(comparison.interestSaved)}
          </p>
        </div>
        <div class="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
          <p class="text-xs text-emerald-400">{m.plan_debt_time_saved()}</p>
          <p class="mt-1 text-lg font-semibold text-emerald-300">
            {formatDuration(comparison.monthsSaved)}
          </p>
        </div>
      </div>
    {/if}
  </div>

  <a
    href="/plans/{planId}/scenarios?extra={extraPayment}"
    class="focus-visible:ring-accent flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.plan_debt_compare_link()}
    <ChevronRight size={16} aria-hidden="true" />
  </a>
</section>
