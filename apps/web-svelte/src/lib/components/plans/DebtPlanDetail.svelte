<script lang="ts">
  import { page } from "$app/stores";
  import {
    approximateDailyInterest,
    isPaymentBelowMonthlyInterest,
    monthlyInterestAmount,
  } from "$lib/services/debt-amortization";
  import {
    deriveDebtDisplayBalance,
    estimateInterestPaidSince,
    isSnapshotDebtReplay,
    normalizeDebtTermsInput,
    type DebtLinkedPayment,
    type PlanDebtTermsInput,
  } from "$lib/services/plan-debt";
  import { todayIso } from "$lib/services/plans";
  import type { PlanDebtTerms } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { planSettleHref } from "$lib/utils/plan-routes";
  import PlanForwardNav from "$lib/components/plans/PlanForwardNav.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import { ChevronRight } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    planId: string;
    terms: PlanDebtTerms;
    planStartDate: string;
    planEndDate: string;
    derivedBalance?: number | null;
    linkedExpenseTotal?: number;
    linkedExpenses?: DebtLinkedPayment[];
    onSyncBalance?: () => void | Promise<void>;
    onTermsSave?: (input: PlanDebtTermsInput) => void | Promise<void>;
    onPlanDatesSave?: (dates: { start_date: string; end_date: string }) => void | Promise<void>;
    refinancedFromPlanId?: string | null;
    replacedByPlanId?: string | null;
    syncing?: boolean;
    termsSaving?: boolean;
  }

  let {
    planId,
    terms,
    planStartDate,
    planEndDate,
    derivedBalance = null,
    linkedExpenseTotal = 0,
    linkedExpenses = [],
    onSyncBalance,
    onTermsSave,
    onPlanDatesSave,
    refinancedFromPlanId = null,
    replacedByPlanId = null,
    syncing = false,
    termsSaving = false,
  }: Props = $props();

  let showTermsEdit = $state(false);
  let showSyncConfirm = $state(false);
  let showFullReplayConfirm = $state(false);
  let editOriginal = $state("");
  let editBalance = $state("");
  let editRate = $state("");
  let editPayment = $state("");
  let editStartDate = $state("");
  let editEndDate = $state("");

  $effect(() => {
    editOriginal = String(terms.original_amount);
    editBalance = String(terms.current_balance);
    editRate = String(terms.annual_rate);
    editPayment = String(terms.monthly_payment);
    editStartDate = planStartDate;
    editEndDate = planEndDate;
  });

  const hasLinkedPayments = $derived(linkedExpenseTotal > 0.01);
  const snapshotMode = $derived(
    isSnapshotDebtReplay(terms.anchor_balance, terms.balance_anchor_date)
  );
  const displayBalance = $derived(
    deriveDebtDisplayBalance(terms, planStartDate, linkedExpenses, todayIso())
  );
  const paid = $derived(Math.max(0, Number(terms.original_amount) - displayBalance));
  const interestPaidSinceStart = $derived(
    estimateInterestPaidSince(terms, planStartDate, todayIso())
  );
  const paidPct = $derived(
    terms.original_amount > 0 ? Math.round((paid / terms.original_amount) * 100) : 0
  );
  const dailyInterest = $derived(
    approximateDailyInterest(displayBalance, Number(terms.annual_rate))
  );
  const monthlyInterest = $derived(
    monthlyInterestAmount(displayBalance, Number(terms.annual_rate))
  );
  const paymentBelowInterest = $derived(
    isPaymentBelowMonthlyInterest(
      displayBalance,
      Number(terms.annual_rate),
      Number(terms.monthly_payment)
    )
  );
  const storedLiveBalance = $derived(Number(terms.current_balance));
  const balanceDrift = $derived(
    hasLinkedPayments && Math.abs(displayBalance - storedLiveBalance) > 1
  );
  const syncIncreasesBalance = $derived(displayBalance > storedLiveBalance + 1);
  const showLinkPaymentsInfo = $derived(!hasLinkedPayments && onSyncBalance != null);
  const linkPaymentsInfoTitle = $derived(
    m.plan_debt_link_payments_info({
      date: formatDate(
        snapshotMode && terms.balance_anchor_date != null
          ? terms.balance_anchor_date
          : planStartDate
      ),
      amount: formatCurrency(displayBalance),
    })
  );
  const settleHref = $derived(planSettleHref(planId, $page.url.searchParams));

  function requestSyncBalance() {
    if (syncIncreasesBalance) {
      showSyncConfirm = true;
      return;
    }
    void onSyncBalance?.();
  }

  function confirmSyncBalance() {
    showSyncConfirm = false;
    void onSyncBalance?.();
  }

  async function confirmFullReplay() {
    showFullReplayConfirm = false;
    try {
      const input: PlanDebtTermsInput = {
        ...normalizeDebtTermsInput({
          original_amount: Number(terms.original_amount),
          current_balance: Number(terms.current_balance),
          annual_rate: Number(terms.annual_rate),
          monthly_payment: Number(terms.monthly_payment),
        }),
        clear_balance_anchor: true,
      };
      await onTermsSave?.(input);
      await onSyncBalance?.();
    } catch (err) {
      toastError(err);
    }
  }

  function cancelTermsEdit() {
    editOriginal = String(terms.original_amount);
    editBalance = String(terms.current_balance);
    editRate = String(terms.annual_rate);
    editPayment = String(terms.monthly_payment);
    editStartDate = planStartDate;
    editEndDate = planEndDate;
    showTermsEdit = false;
  }

  async function saveTermsEdit() {
    if (editEndDate < editStartDate) {
      toast.error(m.plan_form_dates_invalid());
      return;
    }
    try {
      const balanceChanged = Math.abs(Number(editBalance) - Number(terms.current_balance)) > 0.01;
      const input: PlanDebtTermsInput = {
        ...normalizeDebtTermsInput({
          original_amount: Number(editOriginal),
          current_balance: Number(editBalance),
          annual_rate: Number(editRate),
          monthly_payment: Number(editPayment),
        }),
        ...(balanceChanged ? { reset_balance_anchor: true } : {}),
      };
      await onTermsSave?.(input);
      if (onPlanDatesSave && (editStartDate !== planStartDate || editEndDate !== planEndDate)) {
        await onPlanDatesSave({ start_date: editStartDate, end_date: editEndDate });
      }
      showTermsEdit = false;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      switch (code) {
        case "debt_original_required":
          toast.error(m.plan_debt_original_required());
          break;
        case "debt_payment_required":
          toast.error(m.plan_debt_payment_required());
          break;
        case "debt_rate_invalid":
          toast.error(m.plan_debt_rate_invalid());
          break;
        case "debt_balance_exceeds_original":
          toast.error(m.plan_debt_balance_exceeds_original());
          break;
        default:
          toastError(err);
      }
    }
  }
</script>

<section class="space-y-5">
  {#if refinancedFromPlanId}
    <a
      href="/plans/{refinancedFromPlanId}"
      class="focus-visible:ring-accent flex items-center justify-between rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2.5 text-xs font-medium text-sky-300 hover:bg-sky-500/15 focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.plan_debt_refinance_from()}
      <span class="inline-flex items-center gap-1 font-semibold">
        {m.plan_debt_refinance_view_old()}
        <ChevronRight size={14} aria-hidden="true" />
      </span>
    </a>
  {/if}
  {#if replacedByPlanId}
    <a
      href="/plans/{replacedByPlanId}"
      class="focus-visible:ring-accent flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-300 hover:bg-amber-500/15 focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.plan_debt_refinanced_badge()}
      <span class="inline-flex items-center gap-1 font-semibold">
        {m.plan_debt_refinance_view_new()}
        <ChevronRight size={14} aria-hidden="true" />
      </span>
    </a>
  {/if}
  {#if showLinkPaymentsInfo}
    <PlanForwardNav
      href={settleHref}
      title={linkPaymentsInfoTitle}
      ariaLabel={m.plan_debt_sync_link_payments()}
      variant="info"
    />
  {:else if balanceDrift && derivedBalance != null && onSyncBalance}
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-amber-100">
          {m.plan_debt_sync_from_links({
            derived: formatCurrency(displayBalance),
            stored: formatCurrency(storedLiveBalance),
          })}
        </p>
        <button
          type="button"
          disabled={syncing}
          onclick={requestSyncBalance}
          class={cn(
            "rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50",
            syncIncreasesBalance
              ? "border border-amber-400/40 bg-transparent text-amber-200"
              : "bg-amber-500/20 text-amber-200"
          )}
        >
          {m.plan_debt_sync_apply()}
        </button>
      </div>
    </div>
  {/if}

  <div
    class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_90%_10%,rgba(45,212,191,0.12),transparent_45%)] p-5"
  >
    <p class="text-eyebrow text-slate-400">{m.plan_debt_remaining_hero()}</p>
    <p class="text-accent mt-2 text-4xl font-semibold tabular-nums">
      ~{formatCurrency(displayBalance)}
    </p>
    <p class="mt-1 text-sm text-slate-400">
      z {formatCurrency(Number(terms.original_amount))}
    </p>
    {#if snapshotMode && terms.balance_anchor_date != null && terms.anchor_balance != null}
      <p class="mt-1 text-xs text-slate-500">
        {m.plan_debt_snapshot_note({
          amount: formatCurrency(Number(terms.anchor_balance)),
          date: formatDate(terms.balance_anchor_date),
        })}
      </p>
    {/if}
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
    {#if interestPaidSinceStart > 0.01}
      <p class="mt-1 text-xs text-slate-400">
        {m.plan_debt_interest_paid_since({
          date: formatDate(planStartDate),
          amount: formatCurrency(interestPaidSinceStart),
        })}
      </p>
      {#if !hasLinkedPayments}
        <p class="mt-0.5 text-xs text-slate-500">{m.plan_debt_interest_estimate_note()}</p>
      {/if}
    {/if}
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

  {#if paymentBelowInterest}
    <p
      class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
      role="status"
    >
      {m.plan_debt_payment_below_interest({
        payment: formatCurrency(Number(terms.monthly_payment)),
        interest: formatCurrency(monthlyInterest),
      })}
    </p>
  {/if}

  {#if onTermsSave}
    <div class="rounded-2xl border border-white/5 bg-slate-900/40">
      <button
        type="button"
        disabled={termsSaving}
        onclick={() => (showTermsEdit = !showTermsEdit)}
        class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50"
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
              min="0.01"
              step="0.01"
              required
              disabled={termsSaving}
              bind:value={editOriginal}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_balance()}
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={termsSaving}
              bind:value={editBalance}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
            />
            <span class="mt-1 block text-xs text-slate-500">
              {m.plan_debt_balance_today_estimate({ amount: formatCurrency(displayBalance) })}
            </span>
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_rate()}
            <input
              type="number"
              min="0"
              step="0.01"
              required
              disabled={termsSaving}
              bind:value={editRate}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_payment()}
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              disabled={termsSaving}
              bind:value={editPayment}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
            />
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <DayPicker
              id="debt-edit-start-{planId}"
              bind:value={editStartDate}
              label={m.plan_form_start_date()}
              yearsPast={50}
              yearsAhead={1}
              showLabel={true}
              disabled={termsSaving}
            />
            <DayPicker
              id="debt-edit-end-{planId}"
              bind:value={editEndDate}
              label={m.plan_form_end_date_debt()}
              yearsPast={0}
              yearsAhead={100}
              showLabel={true}
              disabled={termsSaving}
            />
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              disabled={termsSaving}
              onclick={cancelTermsEdit}
              class="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50"
            >
              {m.common_cancel()}
            </button>
            <button
              type="button"
              disabled={termsSaving}
              onclick={saveTermsEdit}
              class="bg-accent-gradient flex-1 rounded-xl py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {termsSaving ? m.common_saving() : m.common_save()}
            </button>
          </div>
          {#if snapshotMode && onSyncBalance}
            <button
              type="button"
              disabled={termsSaving}
              onclick={() => (showFullReplayConfirm = true)}
              class="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50"
            >
              {m.plan_debt_full_replay_action()}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<ConfirmDialog
  open={showFullReplayConfirm}
  message={snapshotMode && terms.balance_anchor_date != null && terms.anchor_balance != null
    ? m.plan_debt_full_replay_confirm({
        original: formatCurrency(Number(terms.original_amount)),
        amount: formatCurrency(Number(terms.anchor_balance)),
        date: formatDate(terms.balance_anchor_date),
      })
    : ""}
  pending={termsSaving || syncing}
  onclose={() => (showFullReplayConfirm = false)}
  onconfirm={confirmFullReplay}
/>

<ConfirmDialog
  open={showSyncConfirm}
  message={derivedBalance != null
    ? m.plan_debt_sync_confirm_increase({
        stored: formatCurrency(storedLiveBalance),
        derived: formatCurrency(displayBalance),
      })
    : ""}
  pending={syncing}
  onclose={() => (showSyncConfirm = false)}
  onconfirm={confirmSyncBalance}
/>
