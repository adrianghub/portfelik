<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import {
    compareLumpSumOverpay,
    compareOverpay,
    compareOverpayVsInvest,
    effectiveReturnAfterBelka,
    formatDuration,
  } from "$lib/services/debt-amortization";
  import { fetchPlanDebtTerms } from "$lib/services/plan-debt";
  import { fetchPlanById } from "$lib/services/plans";
  import { cn, formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { ArrowLeft, Sparkles } from "lucide-svelte";

  const id = $derived($page.params.id ?? "");
  const mode = $derived($page.url.searchParams.get("mode") === "lump" ? "lump" : "monthly");
  const extraParam = $derived(Number($page.url.searchParams.get("extra") ?? "500"));
  const lumpParam = $derived(Number($page.url.searchParams.get("amount") ?? "10000"));
  let investReturn = $state(7);

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

  const comparison = $derived.by(() => {
    const terms = termsQuery.data;
    if (!terms) return null;
    const input = {
      currentBalance: Number(terms.current_balance),
      annualRate: Number(terms.annual_rate),
      monthlyPayment: Number(terms.monthly_payment),
    };
    if (mode === "lump") {
      const lump = compareLumpSumOverpay(input, lumpParam);
      return { mode: "lump" as const, input, terms, lump, vs: null, overpay: null };
    }
    const overpay = compareOverpay(input, extraParam);
    const vs = compareOverpayVsInvest(input, extraParam, investReturn);
    return { mode: "monthly" as const, input, terms, overpay, vs, lump: null };
  });

  const loanRate = $derived(comparison ? Number(comparison.terms.annual_rate).toFixed(2) : "0");
  const effectiveInvest = $derived(effectiveReturnAfterBelka(investReturn).toFixed(1));
  const rateBarInvestPct = $derived.by(() => {
    if (!comparison || comparison.mode === "lump") return 0;
    const loan = Number(comparison.terms.annual_rate);
    const invest = comparison.vs!.effectiveInvestReturnPct;
    const max = Math.max(loan, invest, 1);
    return Math.round((invest / max) * 100);
  });
  const rateBarLoanPct = $derived.by(() => {
    if (!comparison || comparison.mode === "lump") return 0;
    const loan = Number(comparison.terms.annual_rate);
    const invest = comparison.vs!.effectiveInvestReturnPct;
    const max = Math.max(loan, invest, 1);
    return Math.round((loan / max) * 100);
  });
</script>

<svelte:head>
  <title>{m.plan_scenarios_title()} · Portfelik</title>
</svelte:head>

<div class="container mx-auto max-w-2xl space-y-6 px-4 py-6">
  <div class="flex items-center gap-3">
    <button
      type="button"
      onclick={() => goto(`/plans/${id}`)}
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

  {#if termsQuery.data && comparison}
    {#if comparison.mode === "monthly" && comparison.vs}
      <div
        class={cn(
          "rounded-2xl border px-4 py-4",
          comparison.vs.recommendation === "overpay"
            ? "border-emerald-500/40 bg-emerald-500/10"
            : comparison.vs.recommendation === "invest"
              ? "border-sky-500/40 bg-sky-500/10"
              : "border-white/10 bg-slate-900/50"
        )}
        data-testid="scenarios-verdict"
      >
        <p class="text-lg font-semibold text-white">
          {#if comparison.vs.recommendation === "overpay"}
            {m.plan_scenarios_verdict_overpay()}
          {:else if comparison.vs.recommendation === "invest"}
            {m.plan_scenarios_verdict_invest()}
          {:else}
            {m.plan_scenarios_verdict_tie()}
          {/if}
        </p>
        <p class="mt-2 text-sm text-slate-300">
          {#if comparison.vs.recommendation === "overpay"}
            {m.plan_scenarios_insight_overpay({
              rate: loanRate,
              breakEven: comparison.vs.breakEvenGrossReturn.toFixed(1),
            })}
          {:else if comparison.vs.recommendation === "invest"}
            {m.plan_scenarios_insight_invest()}
          {:else}
            {m.plan_scenarios_recommend_tie()}
          {/if}
        </p>
      </div>

      <div class="space-y-1">
        <label class="text-xs text-slate-400" for="invest-return"
          >{m.plan_scenarios_invest_return()}</label
        >
        <input
          id="invest-return"
          type="range"
          min="0"
          max="15"
          step="0.5"
          bind:value={investReturn}
          class="accent-accent w-full"
        />
        <div class="flex items-center justify-between text-sm">
          <span class="font-semibold text-slate-100 tabular-nums">{investReturn}%</span>
          <span class="text-xs text-slate-500">
            {m.plan_scenarios_belka_effective({ pct: effectiveInvest })}
          </span>
        </div>
      </div>

      <div class="space-y-3" data-testid="scenarios-rate-comparison">
        <div class="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-sm font-semibold text-emerald-300">
              {m.plan_scenarios_rate_loan({ rate: loanRate })}
            </p>
            <p class="text-xs text-emerald-400/80">{m.plan_scenarios_rate_loan_hint()}</p>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              class="h-full rounded-full bg-emerald-500 transition-all"
              style="width: {rateBarLoanPct}%"
            ></div>
          </div>
        </div>
        <div class="rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-sm font-semibold text-sky-300">
              {m.plan_scenarios_rate_invest({ pct: effectiveInvest })}
            </p>
            <p class="text-xs text-sky-400/80">{m.plan_scenarios_rate_invest_hint()}</p>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              class="h-full rounded-full bg-sky-500 transition-all"
              style="width: {rateBarInvestPct}%"
            ></div>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <h2 class="text-sm font-medium text-slate-300">{m.plan_scenarios_practical_heading()}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p class="text-xs font-medium text-emerald-400 uppercase">
              {m.plan_scenarios_overpay_savings_label()}
            </p>
            <p class="mt-2 text-xl font-bold text-emerald-200 tabular-nums">
              +{formatCurrency(comparison.vs.overpayInterestSaved)}
            </p>
            <p class="mt-1 text-xs text-slate-400">
              {m.plan_scenarios_overpay_months_saved({
                duration: formatDuration(comparison.overpay!.monthsSaved),
              })}
            </p>
            <p class="mt-2 text-xs text-slate-500">{m.plan_scenarios_overpay_desc()}</p>
          </div>
          <div class="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
            <p class="text-xs font-medium text-sky-400 uppercase">
              {m.plan_scenarios_invest_gain_label()}
            </p>
            <p class="mt-2 text-xl font-bold text-sky-200 tabular-nums">
              +{formatCurrency(comparison.vs.investNetGain)}
            </p>
            <p class="mt-2 text-xs text-slate-500">{m.plan_scenarios_invest_desc()}</p>
          </div>
        </div>
      </div>

      <div
        class="flex gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-3 text-sm text-slate-300"
      >
        <Sparkles size={18} class="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
        <p>{m.plan_scenarios_amounts_footnote()}</p>
      </div>
    {:else if comparison.mode === "lump" && comparison.lump}
      <div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
        <p class="text-lg font-semibold text-emerald-200">{m.plan_scenarios_verdict_overpay()}</p>
        <p class="mt-2 text-sm text-slate-300">
          {m.plan_scenarios_overpay_desc()}
        </p>
      </div>

      <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p class="text-xs font-medium text-emerald-400 uppercase">
          {m.plan_scenarios_overpay_savings_label()}
        </p>
        <p class="mt-2 text-xl font-bold text-emerald-200 tabular-nums">
          +{formatCurrency(comparison.lump.interestSaved)}
        </p>
        <p class="mt-1 text-xs text-slate-400">
          {m.plan_scenarios_overpay_months_saved({
            duration: formatDuration(comparison.lump.monthsSaved),
          })}
        </p>
      </div>

      <p class="text-sm text-slate-400">{m.plan_scenarios_lump_invest_unavailable()}</p>
    {/if}

    <p class="text-xs text-slate-500">{m.plan_scenarios_disclaimer()}</p>
  {/if}
</div>
