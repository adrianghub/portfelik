<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { deriveDebtDisplayBalance, fetchPlanDebtTermsByPlanIds } from "$lib/services/plan-debt";
  import {
    fetchDashboardPlanProgress,
    type PlanSettlementProgress,
  } from "$lib/services/plan-settlement";
  import { todayIso } from "$lib/services/plans";
  import type { PlanDebtTerms } from "$lib/types";
  import { getPlanEmoji } from "$lib/utils/plan-emoji";
  import { formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { Sparkles } from "lucide-svelte";

  const progressQuery = createQuery(() => ({
    queryKey: ["plan-progress"],
    queryFn: () => fetchDashboardPlanProgress(),
  }));

  const activePlans = $derived(
    (progressQuery.data ?? []).filter(
      (p) =>
        p.kind === "debt" ||
        (p.targetAmount != null && p.targetAmount > 0) ||
        p.eligibleCount > 0 ||
        p.linkedCount > 0 ||
        (p.budgetAmount != null && p.budgetAmount > 0)
    )
  );

  const debtPlanIds = $derived(
    (progressQuery.data ?? []).filter((p) => p.kind === "debt").map((p) => p.planId)
  );

  const debtTermsQuery = createQuery(() => ({
    queryKey: ["plan-debt-terms-list", debtPlanIds],
    queryFn: () => fetchPlanDebtTermsByPlanIds(debtPlanIds),
    enabled: debtPlanIds.length > 0,
  }));

  // Kind-aware display matching PlanCard on /plans: debt uses the canonical display balance,
  // save uses saved/target.
  function progressDisplay(
    plan: PlanSettlementProgress,
    terms: PlanDebtTerms | undefined
  ): { pct: number | null; label: string } {
    if (plan.kind === "debt" && terms && Number(terms.original_amount) > 0) {
      const balance = deriveDebtDisplayBalance(terms, plan.startDate ?? todayIso(), [], todayIso());
      const paid = Math.max(0, Number(terms.original_amount) - balance);
      const pct = Math.min(
        100,
        Math.max(0, Math.round((paid / Number(terms.original_amount)) * 100))
      );
      return {
        pct,
        label: m.plan_debt_card_progress({
          paid: formatCurrency(paid),
          total: formatCurrency(Number(terms.original_amount)),
        }),
      };
    }
    if (plan.kind === "save" && plan.targetAmount != null && plan.targetAmount > 0) {
      const pct = Math.min(100, Math.round((plan.savedAmount / plan.targetAmount) * 100));
      return {
        pct,
        label: `${formatCurrency(plan.savedAmount)} / ${formatCurrency(plan.targetAmount)}`,
      };
    }
    if (plan.budgetAmount != null && plan.budgetAmount > 0) {
      const pct = Math.round(Math.min(1, plan.spentAmount / plan.budgetAmount) * 100);
      return {
        pct,
        label: `${formatCurrency(plan.spentAmount)} / ${formatCurrency(plan.budgetAmount)}`,
      };
    }
    return { pct: null, label: formatCurrency(plan.spentAmount) };
  }
</script>

{#if progressQuery.isPending}
  <div class="h-28 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
{:else if progressQuery.isError}
  <p class="text-sm text-rose-400">{m.dashboard_plan_progress_error()}</p>
{:else if activePlans.length > 0}
  <section
    class="min-w-0 overflow-x-clip rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
    aria-labelledby="dashboard-plan-progress-title"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <p id="dashboard-plan-progress-title" class="text-eyebrow text-slate-400">
        {m.dashboard_plan_progress_title()}
      </p>
      <a href="/plans" class="text-accent shrink-0 text-xs font-semibold hover:underline">
        {m.dashboard_plan_progress_all()}
      </a>
    </div>
    <ul class="space-y-2">
      {#each activePlans.slice(0, 4) as plan (plan.planId)}
        {@const emoji = getPlanEmoji(undefined, plan.planName)}
        {@const terms = plan.kind === "debt" ? debtTermsQuery.data?.[plan.planId] : undefined}
        {@const display = progressDisplay(plan, terms)}
        <li>
          <a
            href={plan.eligibleCount > 0 ? `/plans/${plan.planId}/settle` : `/plans/${plan.planId}`}
            class="block rounded-xl border border-white/5 px-3 py-2 transition-colors hover:bg-white/5"
          >
            <div class="flex min-w-0 items-center gap-2">
              <div
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm"
                aria-hidden="true"
              >
                {#if emoji}
                  {emoji}
                {:else}
                  <span class="text-xs font-semibold text-slate-400">
                    {plan.planName.charAt(0).toUpperCase()}
                  </span>
                {/if}
              </div>
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                {plan.planName}
              </span>
              {#if plan.eligibleCount > 0}
                <span
                  class="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                >
                  <Sparkles size={8} strokeWidth={2} aria-hidden="true" />
                  {plan.eligibleCount}
                </span>
              {/if}
            </div>
            <div class="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
              <span class="min-w-0 truncate text-slate-400 tabular-nums">{display.label}</span>
              {#if display.pct != null && display.pct > 0}
                <span class="text-accent shrink-0 font-semibold tabular-nums">{display.pct}%</span>
              {/if}
            </div>
            {#if display.pct != null && display.pct > 0}
              <div
                class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuenow={display.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={m.dashboard_plan_progress_bar({
                  name: plan.planName,
                  pct: display.pct,
                })}
              >
                <div
                  class="bg-accent-gradient h-full rounded-full transition-all"
                  style={`width: ${display.pct}%`}
                ></div>
              </div>
            {:else if plan.linkedCount > 0}
              <p class="mt-1 text-xs text-slate-400">
                {m.dashboard_plan_progress_linked_count({ count: plan.linkedCount })}
              </p>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}
