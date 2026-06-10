<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    approximateDailyInterest,
    compareLumpSumOverpay,
    compareOverpay,
    debtDisplayBalance,
    estimateInterestAccruedSince,
    formatDuration,
    isPaymentBelowMonthlyInterest,
    monthlyInterestAmount,
  } from "$lib/services/debt-amortization";
  import {
    normalizeDebtTermsInput,
    type DebtLinkedPayment,
    type PlanDebtTermsInput,
  } from "$lib/services/plan-debt";
  import { todayIso } from "$lib/services/plans";
  import type { PlanDebtTerms } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import {
    debtSimQueryString,
    parseDebtSimUrl,
    scenariosHref,
    type DebtSimMode,
  } from "$lib/utils/plan-debt-sim-url";
  import { planSettleHref } from "$lib/utils/plan-routes";
  import PlanForwardNav from "$lib/components/plans/PlanForwardNav.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import { ChevronRight } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
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
    syncing = false,
    termsSaving = false,
  }: Props = $props();

  let showTermsEdit = $state(false);
  let showSyncConfirm = $state(false);
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
  const accrualAnchor = $derived(terms.updated_at.slice(0, 10));
  const storedBalance = $derived(Number(terms.current_balance));
  const displayBalance = $derived(
    debtDisplayBalance({
      currentBalance: storedBalance,
      annualRate: Number(terms.annual_rate),
      anchorDateIso: accrualAnchor,
      asOfDateIso: todayIso(),
      hasLinkedPayments,
    })
  );
  const paid = $derived(Math.max(0, Number(terms.original_amount) - displayBalance));
  const interestPaidSinceStart = $derived(
    estimateInterestAccruedSince(
      {
        originalAmount: Number(terms.original_amount),
        currentBalance: displayBalance,
        annualRate: Number(terms.annual_rate),
        linkedPayments: hasLinkedPayments ? linkedExpenses : undefined,
      },
      planStartDate,
      todayIso()
    )
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
  const amortInput = $derived({
    currentBalance: displayBalance,
    annualRate: Number(terms.annual_rate),
    monthlyPayment: Number(terms.monthly_payment),
  });
  const maxOverpay = $derived(
    Math.min(
      Math.max(0, displayBalance),
      Math.max(10_000, Math.ceil(Number(terms.monthly_payment) * 5))
    )
  );
  const maxLumpSum = $derived(Math.max(0, Math.floor(displayBalance)));
  const simState = $derived(parseDebtSimUrl($page.url.searchParams));
  const overpayMode = $derived(simState.mode);
  const extraPayment = $derived(Math.min(maxOverpay, simState.extra));
  const lumpSumPayment = $derived(Math.min(maxLumpSum, simState.amount));
  const comparison = $derived(compareOverpay(amortInput, extraPayment));
  const lumpComparison = $derived(compareLumpSumOverpay(amortInput, lumpSumPayment));
  const timelineWithPct = $derived(
    comparison.baseline.payoffMonths > 0
      ? Math.round((comparison.withExtra.payoffMonths / comparison.baseline.payoffMonths) * 100)
      : 100
  );
  const balanceDrift = $derived(
    hasLinkedPayments &&
      derivedBalance != null &&
      Math.abs(derivedBalance - Number(terms.current_balance)) > 1
  );
  const syncIncreasesBalance = $derived(
    derivedBalance != null && derivedBalance > Number(terms.current_balance) + 1
  );
  const showLinkPaymentsInfo = $derived(!hasLinkedPayments && onSyncBalance != null);
  const overpayChips = $derived([0, 500, 1000, 2000, 5000].filter((chip) => chip <= maxOverpay));
  const lumpChips = $derived([5_000, 10_000, 20_000, 50_000].filter((chip) => chip <= maxLumpSum));
  const newInstallment = $derived(Number(terms.monthly_payment) + extraPayment);
  const settleHref = $derived(planSettleHref(planId, $page.url.searchParams));
  const compareHref = $derived(
    scenariosHref(planId, {
      mode: overpayMode,
      extra: extraPayment,
      amount: lumpSumPayment,
      invest: parseDebtSimUrl($page.url.searchParams).invest,
    })
  );

  onMount(() => {
    const params = $page.url.searchParams;
    if (!params.has("extra")) {
      goto(`${$page.url.pathname}?${debtSimQueryString(parseDebtSimUrl(params), params)}`, {
        replaceState: true,
        noScroll: true,
      });
    }
  });

  function pushSimUrl(patch: Partial<ReturnType<typeof parseDebtSimUrl>>) {
    const next = { ...parseDebtSimUrl($page.url.searchParams), ...patch };
    goto(`${$page.url.pathname}?${debtSimQueryString(next, $page.url.searchParams)}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  function setOverpayMode(mode: DebtSimMode) {
    pushSimUrl({ mode });
  }

  function setExtraPayment(value: number) {
    pushSimUrl({ extra: clampOverpay(value) });
  }

  function setLumpSumPayment(value: number) {
    pushSimUrl({ amount: clampLumpSum(value) });
  }

  function clampOverpay(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(maxOverpay, Math.max(0, Math.round(value)));
  }

  function onOverpayInput(event: Event) {
    const raw = (event.currentTarget as HTMLInputElement).value;
    setExtraPayment(Number(raw));
  }

  function clampLumpSum(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(maxLumpSum, Math.max(0, Math.round(value)));
  }

  function onLumpSumInput(event: Event) {
    const raw = (event.currentTarget as HTMLInputElement).value;
    setLumpSumPayment(Number(raw));
  }

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

  async function saveTermsEdit() {
    if (editEndDate < editStartDate) {
      toast.error(m.plan_form_dates_invalid());
      return;
    }
    try {
      const input = normalizeDebtTermsInput({
        original_amount: Number(editOriginal),
        current_balance: Number(editBalance),
        annual_rate: Number(editRate),
        monthly_payment: Number(editPayment),
        payment_day: terms.payment_day,
        anchor_transaction_id: terms.anchor_transaction_id,
      });
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
          toast.error(m.toast_error());
      }
    }
  }
</script>

<section class="space-y-5">
  {#if showLinkPaymentsInfo}
    <PlanForwardNav
      href={settleHref}
      title={m.plan_debt_link_payments_info()}
      ariaLabel={m.plan_debt_sync_link_payments()}
      variant="info"
    />
  {:else if balanceDrift && derivedBalance != null && onSyncBalance}
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-amber-100">
          {m.plan_debt_sync_from_links({
            derived: formatCurrency(derivedBalance),
            stored: formatCurrency(Number(terms.current_balance)),
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
      {formatCurrency(displayBalance)}
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

  <div class="rounded-2xl border border-white/5 bg-slate-900/50 p-4">
    <div class="flex gap-1 rounded-lg border border-white/10 bg-slate-900/60 p-1">
      <button
        type="button"
        onclick={() => setOverpayMode("monthly")}
        class={cn(
          "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
          overpayMode === "monthly"
            ? "bg-accent-gradient text-slate-900"
            : "text-slate-400 hover:text-slate-200"
        )}
      >
        {m.plan_debt_overpay_mode_monthly()}
      </button>
      <button
        type="button"
        onclick={() => setOverpayMode("lump")}
        class={cn(
          "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
          overpayMode === "lump"
            ? "bg-accent-gradient text-slate-900"
            : "text-slate-400 hover:text-slate-200"
        )}
      >
        {m.plan_debt_overpay_mode_lump()}
      </button>
    </div>

    {#if overpayMode === "monthly"}
      <p class="mt-4 text-sm font-medium text-slate-200">{m.plan_debt_overpay_label()}</p>
      <p class="text-accent mt-2 text-2xl font-bold tabular-nums">
        +{formatCurrency(extraPayment)}
        <span class="text-sm font-normal text-slate-400">/mies</span>
      </p>
      <p class="mt-0.5 text-xs text-slate-500">
        {m.plan_debt_new_installment({ amount: formatCurrency(newInstallment) })}
      </p>
      <div class="mt-4 flex items-center gap-3">
        <input
          type="range"
          min="0"
          max={maxOverpay}
          step="50"
          value={extraPayment}
          oninput={(e) => setExtraPayment(Number(e.currentTarget.value))}
          class="accent-accent min-w-0 flex-1"
          aria-valuetext="{extraPayment} zł"
        />
        <input
          type="number"
          min="0"
          max={maxOverpay}
          step="50"
          value={extraPayment}
          oninput={onOverpayInput}
          aria-label={m.plan_debt_overpay_input_aria()}
          class="w-24 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-right text-sm text-slate-100 tabular-nums"
        />
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        {#each overpayChips as chip (chip)}
          <button
            type="button"
            onclick={() => setExtraPayment(chip)}
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
    {:else}
      <p class="mt-4 text-sm font-medium text-slate-200">{m.plan_debt_lump_label()}</p>
      <p class="text-accent mt-2 text-2xl font-bold tabular-nums">
        {formatCurrency(lumpSumPayment)}
      </p>
      <div class="mt-4 flex items-center gap-3">
        <input
          type="range"
          min="0"
          max={maxLumpSum}
          step="500"
          value={lumpSumPayment}
          oninput={(e) => setLumpSumPayment(Number(e.currentTarget.value))}
          class="accent-accent min-w-0 flex-1"
          aria-valuetext="{lumpSumPayment} zł"
        />
        <input
          type="number"
          min="0"
          max={maxLumpSum}
          step="500"
          value={lumpSumPayment}
          oninput={onLumpSumInput}
          aria-label={m.plan_debt_lump_input_aria()}
          class="w-24 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-right text-sm text-slate-100 tabular-nums"
        />
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        {#each lumpChips as chip (chip)}
          <button
            type="button"
            onclick={() => setLumpSumPayment(chip)}
            class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5"
          >
            {formatCurrency(chip)}
          </button>
        {/each}
      </div>
      {#if lumpSumPayment > 0}
        <div class="mt-4 grid gap-2 sm:grid-cols-3">
          <div class="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
            <p class="text-xs text-amber-400">{m.plan_debt_stats_daily_interest()}</p>
            <p class="mt-1 text-sm font-semibold text-amber-200 tabular-nums">
              {m.plan_debt_daily_interest_change({
                before: m.plan_debt_daily_interest_value({
                  amount: formatCurrency(lumpComparison.previousDailyInterest),
                }),
                after: m.plan_debt_daily_interest_value({
                  amount: formatCurrency(lumpComparison.newDailyInterest),
                }),
              })}
            </p>
          </div>
          <div class="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
            <p class="text-xs text-emerald-400">{m.plan_debt_interest_saved()}</p>
            <p class="mt-1 text-lg font-semibold text-emerald-300 tabular-nums">
              {formatCurrency(lumpComparison.interestSaved)}
            </p>
          </div>
          <div class="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
            <p class="text-xs text-emerald-400">{m.plan_debt_time_saved()}</p>
            <p class="mt-1 text-lg font-semibold text-emerald-300">
              {formatDuration(lumpComparison.monthsSaved)}
            </p>
          </div>
        </div>
        <p class="mt-3 text-xs text-slate-500">{m.plan_debt_lump_disclaimer()}</p>
      {/if}
    {/if}
  </div>

  <a
    href={compareHref}
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
              min="0.01"
              step="0.01"
              required
              bind:value={editOriginal}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_balance()}
            <input
              type="number"
              min="0"
              step="0.01"
              bind:value={editBalance}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_rate()}
            <input
              type="number"
              min="0"
              step="0.01"
              required
              bind:value={editRate}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label class="block text-xs text-slate-400">
            {m.plan_debt_payment()}
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              bind:value={editPayment}
              class="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
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
            />
            <DayPicker
              id="debt-edit-end-{planId}"
              bind:value={editEndDate}
              label={m.plan_form_end_date_debt()}
              yearsPast={0}
              yearsAhead={100}
              showLabel={true}
            />
          </div>
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

<ConfirmDialog
  open={showSyncConfirm}
  message={derivedBalance != null
    ? m.plan_debt_sync_confirm_increase({
        stored: formatCurrency(Number(terms.current_balance)),
        derived: formatCurrency(derivedBalance),
      })
    : ""}
  pending={syncing}
  onclose={() => (showSyncConfirm = false)}
  onconfirm={confirmSyncBalance}
/>
