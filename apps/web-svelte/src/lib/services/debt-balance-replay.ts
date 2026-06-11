import { todayIso } from "$lib/services/plans";

export type DebtLinkedPayment = { amount: number; date?: string };

/** Whole calendar days from `fromIso` (exclusive anchor) to `toIso` (inclusive end). */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86_400_000);
}

/** Compound daily interest on outstanding balance since the anchor date. */
function accrueBalanceWithDailyInterest(
  balance: number,
  annualRatePct: number,
  anchorDateIso: string,
  asOfDateIso: string
): number {
  if (balance <= 0.01 || annualRatePct <= 0) return balance;
  const days = daysBetween(anchorDateIso, asOfDateIso);
  if (days <= 0) return balance;
  const dailyRate = annualRatePct / 100 / 365;
  return balance * Math.pow(1 + dailyRate, days);
}

export type DebtBalanceReplayMode = "snapshot" | "full";

export interface DebtBalanceReplayInput {
  originalAmount: number;
  annualRate: number;
  linkedExpenses: DebtLinkedPayment[];
  anchorBalance?: number | null;
  balanceAnchorDate?: string | null;
}

export function isSnapshotDebtReplay(
  anchorBalance: number | null | undefined,
  balanceAnchorDate: string | null | undefined
): boolean {
  return anchorBalance != null && balanceAnchorDate != null;
}

export function filterPreAnchorPayments(
  linkedExpenses: DebtLinkedPayment[],
  balanceAnchorDate: string | null | undefined
): { forward: DebtLinkedPayment[]; ignored: DebtLinkedPayment[] } {
  if (!balanceAnchorDate) {
    return { forward: linkedExpenses, ignored: [] };
  }
  const forward: DebtLinkedPayment[] = [];
  const ignored: DebtLinkedPayment[] = [];
  for (const exp of linkedExpenses) {
    if (!exp.date || exp.date > balanceAnchorDate) {
      forward.push(exp);
    } else {
      ignored.push(exp);
    }
  }
  return { forward, ignored };
}

export function resolveDebtReplay(input: DebtBalanceReplayInput): {
  mode: DebtBalanceReplayMode;
  startBalance: number;
  forwardExpenses: DebtLinkedPayment[];
} {
  if (isSnapshotDebtReplay(input.anchorBalance, input.balanceAnchorDate)) {
    const { forward } = filterPreAnchorPayments(input.linkedExpenses, input.balanceAnchorDate);
    return {
      mode: "snapshot",
      startBalance: Math.max(0, Number(input.anchorBalance)),
      forwardExpenses: forward,
    };
  }
  return {
    mode: "full",
    startBalance: Math.max(0, input.originalAmount),
    forwardExpenses: input.linkedExpenses,
  };
}

/** One amortization period: accrue interest, then apply payment toward principal. */
export function applyDebtPaymentPeriod(
  balance: number,
  annualRate: number,
  payment: number
): number {
  if (balance <= 0.01) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const interest = balance * monthlyRate;
  const actualPayment = Math.min(Math.abs(payment), balance + interest);
  const principal = Math.max(0, actualPayment - interest);
  return Math.max(0, balance - principal);
}

export function consolidateDebtLinkedPayments(linkedExpenses: DebtLinkedPayment[]): number[] {
  if (linkedExpenses.length === 0) return [];
  const byMonth = new Map<string, number>();
  const undated: number[] = [];
  for (const exp of linkedExpenses) {
    const month = exp.date?.slice(0, 7);
    if (month) {
      byMonth.set(month, (byMonth.get(month) ?? 0) + Math.abs(exp.amount));
    } else {
      undated.push(Math.abs(exp.amount));
    }
  }
  const datedPeriods = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, sum]) => sum);
  return [...datedPeriods, ...undated];
}

/**
 * Snapshot model: compound daily interest between events, subtract the full linked
 * payment on each date (not amortization interest-first). Matches manual tracking
 * where ~40 zł/d accrues and the whole rata leaves the balance on payment day.
 */
export function deriveDebtBalanceFlatAccrual(input: {
  startBalance: number;
  startDateIso: string;
  annualRate: number;
  linkedExpenses: DebtLinkedPayment[];
  asOfDateIso: string;
}): number {
  let balance = Math.max(0, input.startBalance);
  let cursor = input.startDateIso;

  const dated = input.linkedExpenses
    .filter((e) => e.date)
    .map((e) => ({ date: e.date!.slice(0, 10), amount: Math.abs(e.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const undated = input.linkedExpenses.filter((e) => !e.date).map((e) => Math.abs(e.amount));

  for (const { date, amount } of dated) {
    balance = accrueBalanceWithDailyInterest(balance, input.annualRate, cursor, date);
    balance = Math.max(0, balance - amount);
    cursor = date;
  }

  for (const amount of undated) {
    balance = Math.max(0, balance - amount);
  }

  balance = accrueBalanceWithDailyInterest(balance, input.annualRate, cursor, input.asOfDateIso);
  return Math.round(balance * 100) / 100;
}

export function deriveDebtBalanceFromLinks(
  input: DebtBalanceReplayInput,
  asOfDateIso: string = todayIso()
): number {
  const { mode, startBalance, forwardExpenses } = resolveDebtReplay(input);

  if (mode === "snapshot") {
    return deriveDebtBalanceFlatAccrual({
      startBalance,
      startDateIso: input.balanceAnchorDate!,
      annualRate: input.annualRate,
      linkedExpenses: forwardExpenses,
      asOfDateIso,
    });
  }

  if (forwardExpenses.length === 0) {
    return Math.round(startBalance * 100) / 100;
  }

  let balance = startBalance;
  for (const payment of consolidateDebtLinkedPayments(forwardExpenses)) {
    balance = applyDebtPaymentPeriod(balance, input.annualRate, payment);
    if (balance <= 0.01) return 0;
  }
  return Math.round(balance * 100) / 100;
}

export function interestAccruedFromLinkedPayments(input: DebtBalanceReplayInput): number {
  const { startBalance, forwardExpenses } = resolveDebtReplay(input);
  const periods = consolidateDebtLinkedPayments(forwardExpenses);
  if (periods.length === 0) return 0;

  const monthlyRate = input.annualRate / 100 / 12;
  let balance = startBalance;
  let totalInterest = 0;
  for (const payment of periods) {
    if (balance <= 0.01) break;
    totalInterest += balance * monthlyRate;
    balance = applyDebtPaymentPeriod(balance, input.annualRate, payment);
  }
  return Math.round(totalInterest * 100) / 100;
}
