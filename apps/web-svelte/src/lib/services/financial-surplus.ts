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
   * (e.g. detected/linked debt-payment transactions). Omit when unknown - the surplus is
   * then flagged `debtAssumptionVerified: false` and the headline assumes raty already sit
   * in expenses (legacy behaviour). When supplied, any shortfall is treated as an obligation
   * not yet reflected in the cashflow and is subtracted from `availableForGoals`.
   *
   * Note: an observed value of `0` means "no linked payments" - in the common
   * imported-but-unlinked case the rata may still sit inside expenses, so callers should
   * omit this field (not pass `0`) unless coverage was actually detected.
   */
  debtPaymentsInExpenses?: number;
  /**
   * Save-goal deposits already made this calendar month (current-month linked income
   * across active save plans). Credited against `saveMonthlyNeeded` so a deposit is not
   * punished twice: once as the transfer's expense side inside `totalExpenses` and again
   * as a still-unmet monthly pace. Defaults to 0 (no observed deposits).
   */
  saveContributionsThisMonth?: number;
}

export interface MonthlySurplusSummary {
  totalIncome: number;
  totalExpenses: number;
  cashflowNet: number;
  debtMonthlyPayments: number;
  saveMonthlyNeeded: number;
  /** Month cashflow (income − expenses). Raty kredytów nie odejmujemy ponownie - są już w wydatkach. */
  surplus: number;
  /**
   * Headline number: free money after debt OBLIGATIONS only (cashflow − unreflected debt).
   * Aspirational save goals never reduce it - putting money toward a goal is an
   * accomplishment, not a deduction. Negative here means a genuine deficit (cashflow cannot
   * cover the debt obligation), which is the only case that warrants alarm framing.
   */
  availableForGoals: number;
  /** Save-goal deposits already made this month (observed linked income). */
  saveContributionsThisMonth: number;
  /** Monthly save pace still left to cover after this month's deposits. */
  unmetSaveNeed: number;
  /**
   * Informational only (breakdown): what would remain after also setting aside the monthly
   * save pace (`availableForGoals − unmetSaveNeed`). NOT the headline - a negative value here
   * just means goals are not fully funded yet, which is not a deficit.
   */
  afterSaveGoals: number;
  /** Debt obligation NOT observed inside expenses (subtracted from availableForGoals). */
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
  const saveContributionsThisMonth = input.saveContributionsThisMonth ?? 0;
  const unmetSaveNeed = Math.max(0, input.saveMonthlyNeeded - saveContributionsThisMonth);
  // Free money after debt obligations only - aspirational save goals do NOT reduce the headline.
  const availableForGoals = cashflowNet - unreflectedDebt;
  // Informational breakdown number: what would be left after also covering the save pace.
  const afterSaveGoals = availableForGoals - unmetSaveNeed;
  return {
    totalIncome: input.totalIncome,
    totalExpenses: input.totalExpenses,
    debtMonthlyPayments: input.debtMonthlyPayments,
    saveMonthlyNeeded: input.saveMonthlyNeeded,
    cashflowNet,
    surplus: cashflowNet,
    availableForGoals,
    saveContributionsThisMonth,
    unmetSaveNeed,
    afterSaveGoals,
    unreflectedDebt,
    debtAssumptionVerified,
    hasSaveGoals: input.saveMonthlyNeeded > 0,
    hasDebtPlans: input.debtMonthlyPayments > 0,
  };
}

/**
 * Gate observed debt coverage before passing it to `computeMonthlySurplus`.
 * Returns the value only when coverage was actually observed (> 0); otherwise
 * `undefined`, so the surplus stays an estimate instead of double-counting an
 * imported-but-unlinked rata.
 */
export function gateObservedDebtCoverage(observed: number): number | undefined {
  return observed > 0 ? observed : undefined;
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
