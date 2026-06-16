import { daysBetween } from "$lib/services/debt-amortization";
import { todayIso } from "$lib/services/plans";

export interface DebtScheduleTerms {
  originalAmount: number;
  annualRate: number; // percent, e.g. 5.96
  monthlyPayment: number; // steady installment
  /** Interest accrues from here; drives the odd first-period gap. */
  disbursementDate: string; // ISO YYYY-MM-DD
  /** Date of the first installment row. */
  firstPaymentDate: string; // ISO YYYY-MM-DD
  /** Explicit first installment from the loan agreement (e.g. 3115.38). Null = use monthlyPayment. */
  firstPaymentAmount?: number | null;
  maxMonths?: number;
}

export interface ScheduleRow {
  seq: number; // 1-based
  date: string; // ISO payment date
  payment: number;
  interest: number;
  principal: number;
  balance: number; // remaining principal after this payment
}

export interface DebtSnapshot {
  balance: number;
  date: string; // ISO
}

const DEFAULT_MAX_MONTHS = 600;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Add whole calendar months to an ISO date, clamping the day to month length. */
export function addCalendarMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysInMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${base.getUTCFullYear()}-${mm}-${dd}`;
}

/** Deterministic amortization table. First row collects odd-period (gap) interest. */
export function buildSchedule(terms: DebtScheduleTerms): ScheduleRow[] {
  const monthlyRate = terms.annualRate / 100 / 12;
  const dailyRate = terms.annualRate / 100 / 365;
  const gapDays = Math.max(0, daysBetween(terms.disbursementDate, terms.firstPaymentDate));
  const maxMonths = terms.maxMonths ?? DEFAULT_MAX_MONTHS;
  const rows: ScheduleRow[] = [];
  let balance = Math.max(0, terms.originalAmount);

  for (let i = 0; i < maxMonths && balance > 0.01; i++) {
    const date = i === 0 ? terms.firstPaymentDate : addCalendarMonthsIso(terms.firstPaymentDate, i);
    const interest = round2(i === 0 ? balance * dailyRate * gapDays : balance * monthlyRate);
    const scheduled =
      i === 0 && terms.firstPaymentAmount != null && terms.firstPaymentAmount > 0
        ? terms.firstPaymentAmount
        : terms.monthlyPayment;
    const payment = round2(Math.min(scheduled, balance + interest));
    const principal = round2(Math.max(0, payment - interest));
    balance = round2(Math.max(0, balance - principal));
    rows.push({ seq: i + 1, date, payment, interest, principal, balance });
    if (payment <= interest + 0.01 && balance > 0.01) break; // negative amortization guard
  }
  return rows;
}

/** Scheduled remaining principal at the last payment date ≤ asOf. Steps monthly, never daily. */
export function scheduleBalanceAt(terms: DebtScheduleTerms, asOfIso: string = todayIso()): number {
  if (asOfIso < terms.firstPaymentDate) return round2(terms.originalAmount);
  let balance = round2(terms.originalAmount);
  for (const row of buildSchedule(terms)) {
    if (row.date > asOfIso) break;
    balance = row.balance;
  }
  return balance;
}

/** Cumulative interest billed through asOf (sum of schedule interest for rows ≤ asOf). */
export function interestPaidThrough(terms: DebtScheduleTerms, asOfIso: string = todayIso()): number {
  let interest = 0;
  for (const row of buildSchedule(terms)) {
    if (row.date > asOfIso) break;
    interest += row.interest;
  }
  return round2(interest);
}

/** Apply one actual payment: simple interest over actual days, then subtract the real amount. */
export function reanchorWithPayment(
  snapshot: DebtSnapshot,
  payment: { amount: number; date: string },
  annualRate: number,
): DebtSnapshot {
  const days = Math.max(0, daysBetween(snapshot.date, payment.date));
  const interest = annualRate > 0 ? snapshot.balance * (annualRate / 100 / 365) * days : 0;
  const balance = Math.max(0, snapshot.balance + interest - Math.abs(payment.amount));
  return { balance: round2(balance), date: payment.date };
}

export interface LiveBalanceAnchor {
  anchorBalance: number | null;
  balanceAnchorDate: string | null;
}

/**
 * Display balance: start from the snapshot anchor (or original at disbursement),
 * replay actual linked payments forward via reanchorWithPayment. No daily tick to asOf —
 * the figure only moves when a real payment lands.
 */
export function liveBalance(
  terms: DebtScheduleTerms,
  anchor: LiveBalanceAnchor,
  linkedPayments: { amount: number; date?: string }[],
  asOfIso: string = todayIso(),
): number {
  let snapshot: DebtSnapshot =
    anchor.anchorBalance != null && anchor.balanceAnchorDate != null
      ? { balance: Math.max(0, anchor.anchorBalance), date: anchor.balanceAnchorDate }
      : { balance: Math.max(0, terms.originalAmount), date: terms.disbursementDate };

  const forward = linkedPayments
    .filter((p) => p.date && p.date > snapshot.date && p.date <= asOfIso)
    .map((p) => ({ amount: Math.abs(p.amount), date: p.date!.slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const p of forward) {
    snapshot = reanchorWithPayment(snapshot, p, terms.annualRate);
    if (snapshot.balance <= 0.01) return 0;
  }
  return round2(snapshot.balance);
}
