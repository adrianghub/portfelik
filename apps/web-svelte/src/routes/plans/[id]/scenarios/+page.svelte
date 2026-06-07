<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import {
    compareOverpayVsInvest,
    compareOverpay,
    effectiveReturnAfterBelka,
  } from "$lib/services/debt-amortization";
  import { fetchPlanDebtTerms } from "$lib/services/plan-debt";
  import { fetchPlanById } from "$lib/services/plans";
  import { cn, formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { ArrowLeft, Sparkles, TrendingUp } from "lucide-svelte";

  const id = $derived($page.params.id ?? "");
  const extraParam = $derived(Number($page.url.searchParams.get("extra") ?? "500"));
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
    const overpay = compareOverpay(input, extraParam);
    const vs = compareOverpayVsInvest(input, extraParam, investReturn);
    return { overpay, vs, input, terms };
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
          {m.plan_scenarios_belka_effective({
            pct: effectiveReturnAfterBelka(investReturn).toFixed(1),
          })}
        </span>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div
        class={cn(
          "relative rounded-2xl border p-4",
          comparison.vs.recommendation === "overpay"
            ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
            : "border-emerald-500/20 bg-emerald-500/5"
        )}
      >
        {#if comparison.vs.recommendation === "overpay"}
          <span
            class="absolute -top-2.5 left-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-slate-900 uppercase"
          >
            {m.plan_scenarios_recommendation_badge()}
          </span>
        {/if}
        <p class="text-sm font-semibold text-emerald-300">{m.plan_scenarios_overpay_card()}</p>
        <p class="mt-1 text-xs text-emerald-400/80">
          {m.plan_scenarios_overpay_rate({ rate: Number(comparison.terms.annual_rate).toFixed(2) })}
        </p>
        <p class="mt-3 text-2xl font-bold text-emerald-200 tabular-nums">
          +{formatCurrency(comparison.vs.overpayInterestSaved)}
        </p>
        <p class="mt-2 text-xs text-slate-400">{m.plan_scenarios_overpay_desc()}</p>
      </div>
      <div
        class={cn(
          "relative rounded-2xl border p-4",
          comparison.vs.recommendation === "invest"
            ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
            : "border-sky-500/20 bg-sky-500/5"
        )}
      >
        {#if comparison.vs.recommendation === "invest"}
          <span
            class="absolute -top-2.5 left-3 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-slate-900 uppercase"
          >
            {m.plan_scenarios_recommendation_badge()}
          </span>
        {/if}
        <p class="flex items-center gap-1.5 text-sm font-semibold text-sky-300">
          <TrendingUp size={14} aria-hidden="true" />
          {m.plan_scenarios_invest_card()}
        </p>
        <p class="mt-1 text-xs text-sky-400/80">
          {m.plan_scenarios_invest_effective({
            pct: comparison.vs.effectiveInvestReturnPct.toFixed(1),
          })}
        </p>
        <p class="mt-3 text-2xl font-bold text-sky-200 tabular-nums">
          +{formatCurrency(comparison.vs.investNetGain)}
        </p>
        <p class="mt-2 text-xs text-slate-400">{m.plan_scenarios_invest_desc()}</p>
      </div>
    </div>

    <div
      class="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100"
    >
      <Sparkles size={18} class="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
      <p>
        {#if comparison.vs.recommendation === "overpay"}
          {m.plan_scenarios_insight_overpay({
            rate: Number(comparison.terms.annual_rate).toFixed(2),
            breakEven: comparison.vs.breakEvenGrossReturn.toFixed(1),
          })}
        {:else if comparison.vs.recommendation === "invest"}
          {m.plan_scenarios_insight_invest()}
        {:else}
          {m.plan_scenarios_recommend_tie()}
        {/if}
      </p>
    </div>

    <p class="text-xs text-slate-500">{m.plan_scenarios_disclaimer()}</p>
  {/if}
</div>
