import * as m from "$lib/paraglide/messages";
import type { MonthlySurplusSummary } from "$lib/services/financial-surplus";
import { currentMonthSavePace, pickMostUrgentOffTrackSave } from "$lib/services/plan-save-pace";
import type { PlanDebtTerms, PlanSummary } from "$lib/types";
import { formatCurrency } from "$lib/utils";

export interface PlanningQueueAction {
  id: string;
  href: string;
  label: string;
  tone: "default" | "warn" | "muted";
}

export function buildPlanningQueueActions(input: {
  summaries: PlanSummary[];
  monthlySurplus: MonthlySurplusSummary;
  debtTerms: Record<string, PlanDebtTerms>;
}): PlanningQueueAction[] {
  const actions: PlanningQueueAction[] = [];
  const { summaries, monthlySurplus } = input;

  if (monthlySurplus.totalIncome <= 0 && monthlySurplus.hasSaveGoals) {
    actions.push({
      id: "no-income",
      href: "/transactions",
      label: m.plans_queue_no_income(),
      tone: "warn",
    });
  }

  const offTrackSave = pickMostUrgentOffTrackSave(summaries, (p) => p.bucket === "active");
  if (offTrackSave) {
    const plan = offTrackSave;
    const paceSoFar = currentMonthSavePace(plan);
    // A partial deposit this month is progress, not failure - ask only for the rest.
    const label =
      paceSoFar > 0
        ? m.plans_queue_save_remaining({
            name: plan.name,
            amount: formatCurrency((plan.monthlyNeeded ?? 0) - paceSoFar),
          })
        : m.plans_queue_save_off_track({
            name: plan.name,
            amount: formatCurrency(plan.monthlyNeeded ?? 0),
          });
    actions.push({
      id: `save-${plan.id}`,
      href: `/plans/${plan.id}`,
      label,
      // Save-goal nudge is an opportunity, not a failure - keep it neutral, not alarm tone.
      tone: "default",
    });
  }

  return actions.slice(0, 3);
}
