<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { MonthlySurplusSummary } from "$lib/services/financial-surplus";
  import type { PlanningQueueAction } from "$lib/services/planning-queue";
  import { cn, formatCurrency } from "$lib/utils";
  import { ChevronRight } from "lucide-svelte";

  interface Props {
    summary: MonthlySurplusSummary;
    actions?: PlanningQueueAction[];
  }

  let { summary, actions = [] }: Props = $props();

  // Headline = free money after debt obligations. Aspirational save goals never push it
  // negative; only an actual deficit (cashflow can't cover obligations) shows alarm framing.
  const headlineAmount = $derived(summary.availableForGoals);
  const headlinePositive = $derived(headlineAmount >= 0);
</script>

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.12),transparent_45%)] p-5"
  aria-labelledby="plans-surplus-title"
>
  <p id="plans-surplus-title" class="text-eyebrow text-slate-400">{m.plans_surplus_title()}</p>

  <p
    class={cn(
      "mt-3 text-2xl font-semibold tabular-nums",
      headlinePositive ? "text-emerald-300" : "text-amber-300"
    )}
  >
    {#if summary.hasSaveGoals}
      {headlinePositive
        ? m.plans_surplus_headline_positive({ amount: formatCurrency(headlineAmount) })
        : m.plans_surplus_headline_negative({ amount: formatCurrency(Math.abs(headlineAmount)) })}
    {:else}
      {headlinePositive
        ? m.plans_surplus_headline_free_positive({ amount: formatCurrency(headlineAmount) })
        : m.plans_surplus_headline_free_negative({
            amount: formatCurrency(Math.abs(headlineAmount)),
          })}
    {/if}
  </p>

  {#if summary.hasDebtPlans && !summary.debtAssumptionVerified}
    <p class="mt-1 text-[11px] text-slate-500">{m.plans_surplus_estimate_note()}</p>
  {/if}

  {#if actions.length > 0}
    <ul class="mt-4 space-y-2">
      {#each actions as action (action.id)}
        <li>
          <a
            href={action.href}
            class={cn(
              "focus-visible:ring-accent flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
              action.tone === "warn"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                : action.tone === "muted"
                  ? "border-white/10 bg-slate-900/50 text-slate-300 hover:bg-white/5"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
            )}
          >
            <span>{action.label}</span>
            <ChevronRight size={14} class="shrink-0 opacity-70" aria-hidden="true" />
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="mt-3 text-xs text-slate-500">{m.plans_surplus_no_actions()}</p>
  {/if}

  <details class="group mt-4">
    <summary
      class="focus-visible:ring-accent cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.plans_surplus_breakdown_toggle()}
    </summary>
    <div class="mt-3 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl border border-white/5 bg-slate-900/50 px-2 py-2.5">
        <p class="text-[10px] tracking-wide text-slate-500 uppercase">
          {m.plans_surplus_income_label()}
        </p>
        <p class="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">
          {formatCurrency(summary.totalIncome)}
        </p>
      </div>
      <div class="rounded-xl border border-white/5 bg-slate-900/50 px-2 py-2.5">
        <p class="text-[10px] tracking-wide text-slate-500 uppercase">
          {m.plans_surplus_expenses_label()}
        </p>
        <p class="mt-1 text-sm font-semibold text-rose-300 tabular-nums">
          {formatCurrency(summary.totalExpenses)}
        </p>
      </div>
      <div class="rounded-xl border border-white/5 bg-slate-900/50 px-2 py-2.5">
        <p class="text-[10px] tracking-wide text-slate-500 uppercase">
          {m.plans_surplus_cashflow_label()}
        </p>
        <p
          class={cn(
            "mt-1 text-sm font-semibold tabular-nums",
            summary.surplus >= 0 ? "text-sky-300" : "text-amber-300"
          )}
        >
          {summary.surplus >= 0 ? "+" : "−"}{formatCurrency(Math.abs(summary.surplus))}
        </p>
      </div>
    </div>
    {#if summary.hasSaveGoals}
      <p class="mt-2 text-xs text-slate-500">
        {m.plans_surplus_after_save({
          save: formatCurrency(summary.saveMonthlyNeeded),
          amount: formatCurrency(summary.afterSaveGoals),
        })}
      </p>
      {#if summary.saveContributionsThisMonth > 0}
        <p class="mt-1 text-xs text-emerald-400/90">
          {m.plans_surplus_saved_this_month({
            saved: formatCurrency(summary.saveContributionsThisMonth),
            need: formatCurrency(summary.saveMonthlyNeeded),
          })}
        </p>
      {/if}
    {/if}
    {#if summary.hasDebtPlans}
      <p class="mt-2 text-xs text-slate-500">
        {m.plans_surplus_debt_note({ debt: formatCurrency(summary.debtMonthlyPayments) })}
      </p>
    {/if}
    <a
      href="/transactions"
      class="focus-visible:ring-accent mt-3 inline-block text-xs font-medium text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.plans_surplus_transactions_link()}
    </a>
  </details>
</section>
