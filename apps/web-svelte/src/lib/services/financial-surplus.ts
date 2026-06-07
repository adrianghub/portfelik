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
  surplus: number;
  hasObligations: boolean;
}

export function computeMonthlySurplus(input: MonthlySurplusInput): MonthlySurplusSummary {
  const cashflowNet = input.totalIncome - input.totalExpenses;
  const surplus = cashflowNet - input.debtMonthlyPayments - input.saveMonthlyNeeded;
  return {
    ...input,
    cashflowNet,
    surplus,
    hasObligations: input.debtMonthlyPayments > 0 || input.saveMonthlyNeeded > 0,
  };
}

export function sumDebtMonthlyPayments(terms: Record<string, PlanDebtTerms>): number {
  return Object.values(terms).reduce((sum, term) => sum + Number(term.monthly_payment), 0);
}

export function sumSaveMonthlyNeeded(
  plans: { kind?: PlanKind; end_date: string; monthlyNeeded?: number | null }[],
  today = new Date().toISOString().slice(0, 10)
): number {
  return plans
    .filter((plan) => (plan.kind ?? "spend") === "save" && plan.end_date >= today)
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
