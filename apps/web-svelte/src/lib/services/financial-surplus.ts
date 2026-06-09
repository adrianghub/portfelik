import type { Plan, PlanDebtTerms, PlanKind } from "$lib/types";

function isActivePlan(plan: { start_date: string; end_date: string }, today: string): boolean {
  return plan.start_date <= today && plan.end_date >= today;
}

export interface MonthlySurplusInput {
  totalIncome: number;
  totalExpenses: number;
  debtMonthlyPayments: number;
  saveMonthlyNeeded: number;
  /**
   * Portion of `debtMonthlyPayments` actually observed inside `totalExpenses` this month
   * (e.g. detected/linked debt-payment transactions). Omit when unknown — the surplus is
   * then flagged `debtAssumptionVerified: false` and the headline assumes raty already sit
   * in expenses (legacy behaviour). When supplied, any shortfall is treated as an obligation
   * not yet reflected in the cashflow and is subtracted from `afterSaveGoals`.
   */
  debtPaymentsInExpenses?: number;
}

export interface MonthlySurplusSummary {
  totalIncome: number;
  totalExpenses: number;
  cashflowNet: number;
  debtMonthlyPayments: number;
  saveMonthlyNeeded: number;
  /** Month cashflow (income − expenses). Raty kredytów nie odejmujemy ponownie - są już w wydatkach. */
  surplus: number;
  /** Cashflow minus save-goal pace minus any debt obligation not reflected in expenses. */
  afterSaveGoals: number;
  /** Debt obligation NOT observed inside expenses (subtracted from afterSaveGoals). */
  unreflectedDebt: number;
  /** True only when the caller supplied observed debt coverage; false = assumption unchecked. */
  debtAssumptionVerified: boolean;
  hasSaveGoals: boolean;
  hasDebtPlans: boolean;
}

export function computeMonthlySurplus(input: MonthlySurplusInput): MonthlySurplusSummary {
  const cashflowNet = input.totalIncome - input.totalExpenses;
  // When coverage is unknown, assume the full payment is already inside expenses
  // (legacy behaviour) but flag the result as unverified so the UI can mark it an estimate.
  const debtAssumptionVerified = input.debtPaymentsInExpenses !== undefined;
  const observed = input.debtPaymentsInExpenses ?? input.debtMonthlyPayments;
  const unreflectedDebt = Math.max(0, input.debtMonthlyPayments - observed);
  const afterSaveGoals = cashflowNet - input.saveMonthlyNeeded - unreflectedDebt;
  return {
    totalIncome: input.totalIncome,
    totalExpenses: input.totalExpenses,
    debtMonthlyPayments: input.debtMonthlyPayments,
    saveMonthlyNeeded: input.saveMonthlyNeeded,
    cashflowNet,
    surplus: cashflowNet,
    afterSaveGoals,
    unreflectedDebt,
    debtAssumptionVerified,
    hasSaveGoals: input.saveMonthlyNeeded > 0,
    hasDebtPlans: input.debtMonthlyPayments > 0,
  };
}

export function sumDebtMonthlyPayments(
  plans: Pick<Plan, "id" | "kind" | "start_date" | "end_date">[],
  termsByPlanId: Record<string, PlanDebtTerms>,
  today = new Date().toISOString().slice(0, 10)
): number {
  return plans
    .filter((plan) => plan.kind === "debt" && isActivePlan(plan, today))
    .reduce((sum, plan) => {
      const terms = termsByPlanId[plan.id];
      return sum + (terms ? Number(terms.monthly_payment) : 0);
    }, 0);
}

export function sumSaveMonthlyNeeded(
  plans: {
    kind?: PlanKind;
    start_date?: string;
    end_date: string;
    monthlyNeeded?: number | null;
  }[],
  today = new Date().toISOString().slice(0, 10)
): number {
  return plans
    .filter(
      (plan) =>
        (plan.kind ?? "spend") === "save" &&
        isActivePlan({ start_date: plan.start_date ?? today, end_date: plan.end_date }, today)
    )
    .reduce((sum, plan) => sum + (plan.monthlyNeeded ?? 0), 0);
}

export function currentCalendarMonthBounds(today = new Date()): { start: string; end: string } {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
