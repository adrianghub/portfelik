import * as m from "$lib/paraglide/messages";
import type { MonthlySurplusSummary } from "$lib/services/financial-surplus";
import type { PlanDebtTerms, PlanSummary } from "$lib/types";
import { formatCurrency } from "$lib/utils";
import { polishPluralForm } from "$lib/utils/polish-plural";

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
  const { summaries, monthlySurplus, debtTerms } = input;

  if (monthlySurplus.totalIncome <= 0 && monthlySurplus.hasSaveGoals) {
    actions.push({
      id: "no-income",
      href: "/transactions",
      label: m.plans_queue_no_income(),
      tone: "warn",
    });
  }

  const settleCandidates = summaries
    .filter((p) => p.kind === "spend" && p.bucket === "active" && (p.eligibleCount ?? 0) > 0)
    .sort((a, b) => (b.eligibleCount ?? 0) - (a.eligibleCount ?? 0));
  const totalEligible = settleCandidates.reduce((sum, p) => sum + (p.eligibleCount ?? 0), 0);
  if (totalEligible > 0 && settleCandidates[0]) {
    const top = settleCandidates[0];
    const form = polishPluralForm(totalEligible);
    const label =
      form === "one"
        ? m.plans_queue_settle_one({ count: totalEligible, name: top.name })
        : form === "few"
          ? m.plans_queue_settle_few({ count: totalEligible, name: top.name })
          : m.plans_queue_settle_many({ count: totalEligible, name: top.name });
    actions.push({
      id: "settle",
      href: `/plans/${top.id}/settle`,
      label,
      tone: "default",
    });
  }

  // Only demonstrated current-month deposits count as keeping pace. A historical-average
  // estimate (or no deposits this month) must not suppress the warn chip.
  const currentMonthPace = (p: PlanSummary): number =>
    p.monthlyActualBasis === "current-month" ? (p.monthlyActual ?? 0) : 0;
  const offTrackSave = summaries
    .filter(
      (p) =>
        p.kind === "save" &&
        p.bucket === "active" &&
        p.monthlyNeeded != null &&
        p.monthlyNeeded > 0 &&
        currentMonthPace(p) < p.monthlyNeeded - 0.01
    )
    .sort((a, b) => (b.monthlyNeeded ?? 0) - (a.monthlyNeeded ?? 0));
  if (offTrackSave[0]) {
    const plan = offTrackSave[0];
    const paceSoFar = currentMonthPace(plan);
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

  const activeDebtPlans = summaries.filter((p) => p.kind === "debt" && p.bucket === "active");
  if (activeDebtPlans.length > 0) {
    const totalDebtPayment = activeDebtPlans.reduce((sum, p) => {
      const terms = debtTerms[p.id];
      return sum + (terms ? Number(terms.monthly_payment) : 0);
    }, 0);
    if (totalDebtPayment > 0) {
      const first = activeDebtPlans[0];
      actions.push({
        id: `debt-${first.id}`,
        href: `/plans/${first.id}`,
        label: m.plans_queue_debt_payment({
          amount: formatCurrency(totalDebtPayment),
        }),
        tone: "muted",
      });
    }
  }

  return actions.slice(0, 3);
}
