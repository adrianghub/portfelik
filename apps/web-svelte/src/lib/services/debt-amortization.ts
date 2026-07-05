/** Display-only: approximate daily interest from current balance. */
export function approximateDailyInterest(currentBalance: number, annualRate: number): number {
  return (currentBalance * (annualRate / 100)) / 365;
}

/** Whole calendar days from `fromIso` (exclusive anchor) to `toIso` (inclusive end). */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86_400_000);
}

/** Monthly interest on the current balance at the plan rate. */
export function monthlyInterestAmount(currentBalance: number, annualRate: number): number {
  return currentBalance * (annualRate / 100 / 12);
}

/** True when the scheduled payment does not cover monthly interest (negative amortization risk). */
export function isPaymentBelowMonthlyInterest(
  currentBalance: number,
  annualRate: number,
  monthlyPayment: number
): boolean {
  if (currentBalance <= 0.01) return false;
  return monthlyPayment < monthlyInterestAmount(currentBalance, annualRate) - 0.01;
}
