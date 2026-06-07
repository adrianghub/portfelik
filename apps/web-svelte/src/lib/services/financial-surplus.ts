import type { PlanDebtTerms, PlanKind } from "$lib/types";

export interface MonthlySurplusInput {
  totalIncome: number;
  totalExpenses: number;
  debtMonthlyPayments: number;
  saveMonthlyNeeded: number;
}

export interface MonthlySurplusSummary {
  totalIncome: number;
  totalExpenses: number;
  cashflowNet: number;
  debtMonthlyPayments: number;
  saveMonthlyNeeded: number;
  /** Month cashflow (income − expenses). Raty kredytów nie odejmujemy ponownie — są już w wydatkach. */
  surplus: number;
  /** Cashflow minus save-goal pace (when user tracks accumulation targets). */
  afterSaveGoals: number;
  hasSaveGoals: boolean;
  hasDebtPlans: boolean;
}

export function computeMonthlySurplus(input: MonthlySurplusInput): MonthlySurplusSummary {
  const cashflowNet = input.totalIncome - input.totalExpenses;
  const afterSaveGoals = cashflowNet - input.saveMonthlyNeeded;
  return {
    ...input,
    cashflowNet,
    surplus: cashflowNet,
    afterSaveGoals,
    hasSaveGoals: input.saveMonthlyNeeded > 0,
    hasDebtPlans: input.debtMonthlyPayments > 0,
  };
}

export function sumDebtMonthlyPayments(terms: Record<string, PlanDebtTerms>): number {
  return Object.values(terms).reduce((sum, term) => sum + Number(term.monthly_payment), 0);
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
        (plan.start_date ?? today) <= today &&
        plan.end_date >= today
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
