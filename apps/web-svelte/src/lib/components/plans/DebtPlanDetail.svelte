<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    approximateDailyInterest,
    compareOverpay,
    formatDuration,
  } from "$lib/services/debt-amortization";
  import type { PlanDebtTermsInput } from "$lib/services/plan-debt";
  import type { PlanDebtTerms } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import { ChevronRight } from "lucide-svelte";

  interface Props {
    planId: string;
    terms: PlanDebtTerms;
    derivedBalance?: number | null;
    onSyncBalance?: () => void | Promise<void>;
    onTermsSave?: (input: PlanDebtTermsInput) => void | Promise<void>;
    syncing?: boolean;
    termsSaving?: boolean;
  }

  let {
    planId,
    terms,
    derivedBalance = null,
    onSyncBalance,
    onTermsSave,
    syncing = false,
    termsSaving = false,
  }: Props = $props();

  let extraPayment = $state(500);
  let showTermsEdit = $state(false);
  let editOriginal = $state(String(terms.original_amount));
  let editBalance = $state(String(terms.current_balance));
  let editRate = $state(String(terms.annual_rate));
  let editPayment = $state(String(terms.monthly_payment));

  $effect(() => {
    editOriginal = String(terms.original_amount);
    editBalance = String(terms.current_balance);
    editRate = String(terms.annual_rate);
    editPayment = String(terms.monthly_payment);
  });

  const paid = $derived(Math.max(0, terms.original_amount - terms.current_balance));
  const paidPct = $derived(
    terms.original_amount > 0 ? Math.round((paid / terms.original_amount) * 100) : 0
  );
  const dailyInterest = $derived(
    approximateDailyInterest(Number(terms.current_balance), Number(terms.annual_rate))
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
  const timelineWithPct = $derived(
    comparison.baseline.payoffMonths > 0
      ? Math.round((comparison.withExtra.payoffMonths / comparison.baseline.payoffMonths) * 100)
      : 100
  );
  const balanceDrift = $derived(
    derivedBalance != null && Math.abs(derivedBalance - Number(terms.current_balance)) > 1
  );
  const newInstallment = $derived(Number(terms.monthly_payment) + extraPayment);

  async function saveTermsEdit() {
    await onTermsSave?.({
      original_amount: Number(editOriginal),
      current_balance: Number(editBalance),
      annual_rate: Number(editRate),
      monthly_payment: Number(editPayment),
      payment_day: terms.payment_day,
      anchor_transaction_id: terms.anchor_transaction_id,
    });
    showTermsEdit = false;
  }
</script>

<section class="space-y-5">
  {#if balanceDrift && derivedBalance != null}
    <div
      class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
    >
      <p class="text-sm text-amber-100">
        {m.plan_debt_sync_banner({
          derived: formatCurrency(derivedBalance),
          stored: formatCurrency(Number(terms.current_balance)),
        })}
      </p>
      <button
        type="button"
        disabled={syncing}
        onclick={() => onSyncBalance?.()}
        class="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200 disabled:opacity-50"
      >
        {m.plan_debt_sync_apply()}
      </button>
    </div>
  {/if}

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
    <p class="text-accent mt-2 text-2xl font-bold tabular-nums">
      +{formatCurrency(extraPayment)}
      <span class="text-sm font-normal text-slate-400">/mies</span>
    </p>
    <p class="mt-0.5 text-xs text-slate-500">
      {m.plan_debt_new_installment({ amount: formatCurrency(newInstallment) })}
    </p>
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
      <div class="mt-4 space-y-2">
        <div class="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div
            class="bg-accent-gradient h-full rounded-l-full transition-all duration-500"
            style="width: {timelineWithPct}%"
          ></div>
        </div>
        <div class="flex justify-between gap-2 text-xs">
          <span class="text-accent font-medium">
            {formatDuration(comparison.withExtra.payoffMonths)}
          </span>
          <span class="text-slate-500">
            {m.plan_debt_timeline_was({
              duration: formatDuration(comparison.baseline.payoffMonths),
            })}
          </span>
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

  {#if onTermsSave}
    <div class="rounded-2xl border border-white/5 bg-slate-900/40">
      <button
        type="button"
        onclick={() => (showTermsEdit = !showTermsEdit)}
        class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:text-slate-100"
      >
        {m.plan_debt_edit_terms()}
        <ChevronRight
          size={16}
          class={cn("transition-transform", showTermsEdit && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      {#if showTermsEdit}
        <div class="space-y-3 border-t border-white/5 px-4 py-4">
          <label class="block text-xs text-slate-400">
            {m.plan_debt_original()}
            <input
              type="number"
              bind:value={editOriginal}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_balance()}
            <input
              type="number"
              bind:value={editBalance}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_rate()}
            <input
              type="number"
              step="0.01"
              bind:value={editRate}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_payment()}
            <input
              type="number"
              bind:value={editPayment}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={termsSaving}
            onclick={saveTermsEdit}
            class="bg-accent-gradient w-full rounded-xl py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {m.common_save()}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</section>
