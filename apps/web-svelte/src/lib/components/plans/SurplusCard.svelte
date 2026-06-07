<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { MonthlySurplusSummary } from "$lib/services/financial-surplus";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    summary: MonthlySurplusSummary;
  }

  let { summary }: Props = $props();
</script>

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.12),transparent_45%)] p-5"
  aria-labelledby="plans-surplus-title"
>
  <p id="plans-surplus-title" class="text-eyebrow text-slate-400">{m.plans_surplus_title()}</p>
  <p class="mt-1 text-xs text-slate-500">{m.plans_surplus_subtitle()}</p>
  <p
    class={cn(
      "mt-3 text-3xl font-semibold tabular-nums",
      summary.surplus >= 0 ? "text-sky-300" : "text-amber-300"
    )}
  >
    {summary.surplus >= 0
      ? m.plans_surplus_positive({ amount: formatCurrency(summary.surplus) })
      : m.plans_surplus_negative({ amount: formatCurrency(Math.abs(summary.surplus)) })}
  </p>
  <p class="mt-3 text-xs leading-relaxed text-slate-500">
    {m.plans_surplus_breakdown({
      income: formatCurrency(summary.totalIncome),
      expenses: formatCurrency(summary.totalExpenses),
    })}
  </p>
  {#if summary.hasSaveGoals}
    <p class="mt-2 text-xs leading-relaxed text-slate-500">
      {m.plans_surplus_after_save({
        save: formatCurrency(summary.saveMonthlyNeeded),
        amount: formatCurrency(summary.afterSaveGoals),
      })}
    </p>
  {/if}
  {#if summary.hasDebtPlans}
    <p class="mt-2 text-xs text-slate-500">
      {m.plans_surplus_debt_note({ debt: formatCurrency(summary.debtMonthlyPayments) })}
    </p>
  {/if}
</section>
