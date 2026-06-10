<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { navigateBack } from "$lib/utils/navigation";
  import * as m from "$lib/paraglide/messages";
  import {
    compareLumpSumOverpay,
    compareLumpSumVsInvest,
    compareOverpay,
    compareOverpayVsInvest,
    debtDisplayBalance,
    effectiveReturnAfterBelka,
    formatDuration,
  } from "$lib/services/debt-amortization";
  import { fetchPlanDebtTerms } from "$lib/services/plan-debt";
  import { fetchPlanById, todayIso } from "$lib/services/plans";
  import { cn, formatCurrency } from "$lib/utils";
  import { debtSimQueryString, parseDebtSimUrl } from "$lib/utils/plan-debt-sim-url";
  import { planDetailHref } from "$lib/utils/plan-routes";
  import { createQuery } from "@tanstack/svelte-query";
  import { ArrowLeft, ChevronDown } from "lucide-svelte";

  const id = $derived($page.params.id ?? "");
  const simState = $derived(parseDebtSimUrl($page.url.searchParams));
  const mode = $derived(simState.mode);
  const extraParam = $derived(simState.extra);
  const lumpParam = $derived(simState.amount);
  const investReturn = $derived(simState.invest);

  const planQuery = createQuery(() => ({
    queryKey: ["plan", id],
    queryFn: () => fetchPlanById(id),
    enabled: !!id,
  }));

  const termsQuery = createQuery(() => ({
    queryKey: ["plan-debt-terms", id],
    queryFn: () => fetchPlanDebtTerms(id),
    enabled: !!id && planQuery.data?.kind === "debt",
  }));

  function setInvestReturn(value: number) {
    const snapped = Math.min(15, Math.max(0, Math.round(value / 0.5) * 0.5));
    const next = { ...parseDebtSimUrl($page.url.searchParams), invest: snapped };
    goto(`${$page.url.pathname}?${debtSimQueryString(next, $page.url.searchParams)}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  function goBack() {
    navigateBack(planDetailHref(id, $page.url.searchParams));
  }

  const comparison = $derived.by(() => {
    const terms = termsQuery.data;
    if (!terms) return null;
    // Same canonical balance as the plan detail headline, so slider projections agree with it.
    const input = {
      currentBalance: debtDisplayBalance({
        currentBalance: Number(terms.current_balance),
        annualRate: Number(terms.annual_rate),
        anchorDateIso: terms.updated_at.slice(0, 10),
        asOfDateIso: todayIso(),
      }),
      annualRate: Number(terms.annual_rate),
      monthlyPayment: Number(terms.monthly_payment),
    };
    if (mode === "lump") {
      const lump = compareLumpSumOverpay(input, lumpParam);
      const vs = compareLumpSumVsInvest(input, lumpParam, investReturn);
      return { mode: "lump" as const, input, terms, lump, vs, overpay: null };
    }
    const overpay = compareOverpay(input, extraParam);
    const vs = compareOverpayVsInvest(input, extraParam, investReturn);
    return { mode: "monthly" as const, input, terms, overpay, vs, lump: null };
  });

  const loanRate = $derived(comparison ? Number(comparison.terms.annual_rate).toFixed(2) : "0");
  const effectiveInvest = $derived(effectiveReturnAfterBelka(investReturn).toFixed(1));
  const benefitDelta = $derived.by(() => {
    if (!comparison?.vs) return 0;
    return Math.abs(comparison.vs.overpayTotalBenefit - comparison.vs.investTotalBenefit);
  });
  const showBreakEven = $derived.by(() => {
    const vs = comparison?.vs;
    if (!vs) return false;
    const maxBenefit = Math.max(vs.overpayTotalBenefit, vs.investTotalBenefit);
    return (
      vs.recommendation === "tie" ||
      Math.abs(investReturn - vs.breakEvenGrossReturn) < 1.5 ||
      (maxBenefit > 0 && benefitDelta < maxBenefit * 0.08)
    );
  });
  const rateBarInvestPct = $derived.by(() => {
    if (!comparison?.vs) return 0;
    const loan = Number(comparison.terms.annual_rate);
    const invest = comparison.vs.effectiveInvestReturnPct;
    const max = Math.max(loan, invest, 1);
    return Math.round((invest / max) * 100);
  });
  const rateBarLoanPct = $derived.by(() => {
    if (!comparison?.vs) return 0;
    const loan = Number(comparison.terms.annual_rate);
    const invest = comparison.vs.effectiveInvestReturnPct;
    const max = Math.max(loan, invest, 1);
    return Math.round((loan / max) * 100);
  });
  const interestCost = $derived.by(() => {
    if (!comparison?.vs) return 0;
    if (comparison.mode === "monthly" && "overpayInterestSaved" in comparison.vs) {
      return comparison.vs.overpayInterestSaved;
    }
    return comparison.lump?.interestSaved ?? 0;
  });
</script>

<svelte:head>
  <title>{m.plan_scenarios_title()} · Portfelik</title>
</svelte:head>

<div class="container mx-auto max-w-2xl space-y-6 px-4 py-6">
  <div class="flex items-center gap-3">
    <button
      type="button"
      onclick={goBack}
      class="rounded-full p-1.5 text-slate-400 hover:bg-white/5"
      aria-label={m.common_back()}
    >
      <ArrowLeft size={16} aria-hidden="true" />
    </button>
    <div>
      <h1 class="text-xl font-semibold text-white">{m.plan_scenarios_title()}</h1>
      {#if planQuery.data}
        <p class="text-sm text-slate-400">{planQuery.data.name}</p>
      {/if}
    </div>
  </div>

  {#if termsQuery.data && comparison?.vs}
    {@const vs = comparison.vs}
    <div
      class={cn(
        "rounded-2xl border px-4 py-4",
        vs.recommendation === "overpay"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : vs.recommendation === "invest"
            ? "border-sky-500/40 bg-sky-500/10"
            : "border-white/10 bg-slate-900/50"
      )}
      data-testid="scenarios-verdict"
    >
      <p class="text-lg font-semibold text-white">
        {#if vs.recommendation === "overpay"}
          {m.plan_scenarios_verdict_overpay()}
        {:else if vs.recommendation === "invest"}
          {m.plan_scenarios_verdict_invest()}
        {:else}
          {m.plan_scenarios_verdict_tie()}
        {/if}
      </p>
      <p class="mt-2 text-sm text-slate-300">
        {#if vs.recommendation === "overpay"}
          {m.plan_scenarios_insight_overpay_wins({
            total: formatCurrency(vs.overpayTotalBenefit),
            delta: formatCurrency(benefitDelta),
            other: formatCurrency(vs.investTotalBenefit),
          })}
        {:else if vs.recommendation === "invest"}
          {m.plan_scenarios_insight_invest_wins({
            total: formatCurrency(vs.investTotalBenefit),
            delta: formatCurrency(benefitDelta),
            other: formatCurrency(vs.overpayTotalBenefit),
          })}
        {:else}
          {m.plan_scenarios_recommend_tie()}
        {/if}
      </p>
    </div>

    <p class="text-sm text-slate-400">
      {#if comparison.mode === "monthly"}
        {m.plan_scenarios_monthly_extra({ amount: formatCurrency(extraParam) })}
      {:else}
        {m.plan_scenarios_lump_amount({ amount: formatCurrency(lumpParam) })}
      {/if}
    </p>

    <div class="space-y-1">
      <label class="text-xs text-slate-400" for="invest-return"
        >{m.plan_scenarios_invest_return()}</label
      >
      <div class="flex items-center gap-3">
        <input
          id="invest-return"
          type="range"
          min="0"
          max="15"
          step="0.5"
          value={investReturn}
          oninput={(e) => setInvestReturn(Number(e.currentTarget.value))}
          class="accent-accent min-w-0 flex-1"
        />
        <input
          type="number"
          min="0"
          max="15"
          step="0.5"
          value={investReturn}
          oninput={(e) => setInvestReturn(Number(e.currentTarget.value))}
          aria-label={m.plan_scenarios_invest_return()}
          class="w-20 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-right text-sm text-slate-100 tabular-nums"
        />
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="font-semibold text-slate-100 tabular-nums">{investReturn}%</span>
        <span class="text-xs text-slate-500">
          {m.plan_scenarios_belka_effective({ pct: effectiveInvest })}
        </span>
      </div>
    </div>

    <div class="space-y-2">
      <h2 class="text-sm font-medium text-slate-300">{m.plan_scenarios_practical_heading()}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div
          class={cn(
            "rounded-xl border p-4",
            vs.recommendation === "overpay"
              ? "border-emerald-500/40 bg-emerald-500/10 ring-1 ring-emerald-500/20"
              : "border-emerald-500/20 bg-emerald-500/5"
          )}
        >
          <p class="text-xs font-medium text-emerald-400 uppercase">
            {m.plan_scenarios_total_benefit_label()}
          </p>
          <p class="mt-2 text-2xl font-bold text-emerald-200 tabular-nums">
            +{formatCurrency(vs.overpayTotalBenefit)}
          </p>
          <p class="mt-2 text-sm text-slate-400">
            {m.plan_scenarios_card_overpay_short({
              duration: formatDuration(
                comparison.mode === "monthly"
                  ? comparison.overpay!.monthsSaved
                  : comparison.lump!.monthsSaved
              ),
            })}
          </p>
        </div>
        <div
          class={cn(
            "rounded-xl border p-4",
            vs.recommendation === "invest"
              ? "border-sky-500/40 bg-sky-500/10 ring-1 ring-sky-500/20"
              : "border-sky-500/20 bg-sky-500/5"
          )}
        >
          <p class="text-xs font-medium text-sky-400 uppercase">
            {m.plan_scenarios_total_benefit_label()}
          </p>
          <p class="mt-2 text-2xl font-bold text-sky-200 tabular-nums">
            +{formatCurrency(vs.investTotalBenefit)}
          </p>
          <p class="mt-2 text-sm text-slate-400">{m.plan_scenarios_card_invest_short()}</p>
        </div>
      </div>
    </div>

    <details class="group rounded-xl border border-white/10 bg-slate-900/40">
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden"
      >
        {m.plan_scenarios_breakdown_toggle()}
        <ChevronDown
          size={16}
          class="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="space-y-4 border-t border-white/5 px-4 py-4 text-xs text-slate-400">
        <p class="text-slate-500">{m.plan_scenarios_horizon_note()}</p>

        <div class="space-y-3" data-testid="scenarios-rate-comparison">
          <div class="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-3">
            <p class="text-sm font-semibold text-emerald-300">
              {m.plan_scenarios_rate_loan({ rate: loanRate })}
              <span class="ml-1 text-xs font-normal text-emerald-400/80">
                ({m.plan_scenarios_rate_loan_hint()})
              </span>
            </p>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                class="h-full rounded-full bg-emerald-500"
                style="width: {rateBarLoanPct}%"
              ></div>
            </div>
          </div>
          <div class="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-3">
            <p class="text-sm font-semibold text-sky-300">
              {m.plan_scenarios_rate_invest({ pct: effectiveInvest })}
              <span class="ml-1 text-xs font-normal text-sky-400/80">
                ({m.plan_scenarios_rate_invest_hint()})
              </span>
            </p>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div class="h-full rounded-full bg-sky-500" style="width: {rateBarInvestPct}%"></div>
            </div>
          </div>
          {#if showBreakEven}
            <p
              class="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-100"
              data-testid="scenarios-break-even"
            >
              {m.plan_scenarios_break_even({
                pct: vs.breakEvenGrossReturn.toFixed(1),
                rate: loanRate,
              })}
            </p>
          {/if}
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1">
            <p class="font-medium text-emerald-300">{m.plan_scenarios_verdict_overpay()}</p>
            {#if comparison.mode === "monthly" && "overpayInterestSaved" in vs}
              <p>
                {m.plan_scenarios_overpay_active({
                  amount: formatCurrency(extraParam),
                  duration: formatDuration(vs.overpayActiveMonths),
                })}
              </p>
              <p>
                {m.plan_scenarios_overpay_interest_line({
                  saved: formatCurrency(vs.overpayInterestSaved),
                })}
              </p>
              {#if vs.postPayoffInvestMonths > 0}
                <p>
                  {m.plan_scenarios_overpay_post_invest({
                    amount: formatCurrency(extraParam),
                    duration: formatDuration(vs.postPayoffInvestMonths),
                    gain: formatCurrency(vs.postPayoffInvestNetGain),
                  })}
                </p>
              {/if}
            {:else if comparison.lump}
              <p>
                {m.plan_scenarios_overpay_interest_line({
                  saved: formatCurrency(comparison.lump.interestSaved),
                })}
              </p>
            {/if}
            {#if vs.postPayoffInvestMonths > 0 && vs.freedPaymentInvestNetGain > 0.01}
              <p>
                {m.plan_scenarios_overpay_freed_payment({
                  amount: formatCurrency(Number(comparison.terms.monthly_payment)),
                  duration: formatDuration(vs.postPayoffInvestMonths),
                  gain: formatCurrency(vs.freedPaymentInvestNetGain),
                })}
              </p>
            {/if}
            <p>
              {m.plan_scenarios_overpay_months_saved({
                duration: formatDuration(
                  comparison.mode === "monthly"
                    ? comparison.overpay!.monthsSaved
                    : comparison.lump!.monthsSaved
                ),
              })}
            </p>
          </div>
          <div class="space-y-1">
            <p class="font-medium text-sky-300">{m.plan_scenarios_verdict_invest()}</p>
            {#if comparison.mode === "monthly" && "investTotalContributed" in vs}
              <p>
                {m.plan_scenarios_invest_scenario({
                  amount: formatCurrency(extraParam),
                  duration: formatDuration(vs.baselineLoanMonths),
                })}
              </p>
              <p>
                {m.plan_scenarios_invest_contributed({
                  total: formatCurrency(vs.investTotalContributed),
                })}
              </p>
            {:else}
              <p>
                {m.plan_scenarios_invest_lump_scenario({
                  amount: formatCurrency(lumpParam),
                  duration: formatDuration(vs.baselineLoanMonths),
                })}
              </p>
              <p>
                {m.plan_scenarios_invest_contributed({
                  total: formatCurrency(lumpParam),
                })}
              </p>
            {/if}
            <p>
              {m.plan_scenarios_invest_gain_line({
                gain: formatCurrency(vs.investNetGain),
              })}
            </p>
            {#if interestCost > 0.01}
              <p class="text-slate-300">
                {m.plan_scenarios_breakdown_interest_cost({
                  amount: formatCurrency(interestCost),
                })}
              </p>
            {/if}
            <p class="text-slate-500">{m.plan_scenarios_invest_desc()}</p>
          </div>
        </div>

        <p class="text-slate-500">{m.plan_scenarios_assumptions()}</p>
      </div>
    </details>

    <p class="text-xs text-slate-500">{m.plan_scenarios_disclaimer()}</p>
  {/if}
</div>
