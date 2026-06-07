<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import { compareOverpayVsInvest, compareOverpay } from "$lib/services/debt-amortization";
  import { fetchPlanDebtTerms } from "$lib/services/plan-debt";
  import { fetchPlanById } from "$lib/services/plans";
  import { formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { ArrowLeft } from "lucide-svelte";

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
    return { overpay, vs };
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
    <h1 class="text-xl font-semibold text-white">{m.plan_scenarios_title()}</h1>
  </div>

  {#if termsQuery.data && comparison}
    <div class="space-y-1">
      <label class="text-xs text-slate-400" for="invest-return"
        >{m.plan_scenarios_invest_return()}</label
      >
      <input
        id="invest-return"
        type="number"
        min="0"
        max="30"
        step="0.5"
        bind:value={investReturn}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p class="text-sm font-semibold text-emerald-300">{m.plan_scenarios_overpay_card()}</p>
        <p class="mt-2 text-2xl font-bold text-emerald-200 tabular-nums">
          +{formatCurrency(comparison.vs.overpayInterestSaved)}
        </p>
        <p class="mt-2 text-xs text-slate-400">{m.plan_scenarios_overpay_desc()}</p>
      </div>
      <div class="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
        <p class="text-sm font-semibold text-sky-300">{m.plan_scenarios_invest_card()}</p>
        <p class="mt-2 text-2xl font-bold text-sky-200 tabular-nums">
          +{formatCurrency(comparison.vs.investNominalGain)}
        </p>
        <p class="mt-2 text-xs text-slate-400">{m.plan_scenarios_invest_desc()}</p>
      </div>
    </div>

    <p class="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-300">
      {#if comparison.vs.recommendation === "overpay"}
        {m.plan_scenarios_recommend_overpay()}
      {:else if comparison.vs.recommendation === "invest"}
        {m.plan_scenarios_recommend_invest()}
      {:else}
        {m.plan_scenarios_recommend_tie()}
      {/if}
    </p>
    <p class="text-xs text-slate-500">{m.plan_scenarios_disclaimer()}</p>
  {/if}
</div>
