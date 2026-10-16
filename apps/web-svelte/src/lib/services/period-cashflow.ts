import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { FORECAST_EXTRA_STATUSES, LEDGER_STATUSES } from "$lib/services/transaction-cashflow";
import type { TransactionStatus, TransactionType } from "$lib/types";

/** Minimal row shape for period Wpływy / Wydatki / Bilans tiles. */
export interface PeriodCashflowTx {
  type: TransactionType;
  amount: number;
  status: TransactionStatus | string;
  currency: string;
}

export interface PeriodLeg {
  /** Paid / received in the filtered set. */
  realized: number;
  /** Upcoming + overdue still open. */
  open: number;
  /** Realized + open. */
  total: number;
}

/**
 * Period cashflow breakdown shared by Transakcje tiles and Kokpit explanations.
 * This is a period bilans, never a cash saldo.
 */
export interface PeriodCashflowBreakdown {
  income: PeriodLeg;
  expense: PeriodLeg;
  /** Paid income − paid expense. */
  realizedNet: number;
  /** (Paid + open income) − (paid + open expense). */
  projectedNet: number;
}

const LEDGER = new Set<string>(LEDGER_STATUSES);
const OPEN = new Set<string>(FORECAST_EXTRA_STATUSES);

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

function leg(realizedCents: number, openCents: number): PeriodLeg {
  return {
    realized: fromCents(realizedCents),
    open: fromCents(openCents),
    total: fromCents(realizedCents + openCents),
  };
}

/**
 * Split filtered transactions into realized vs Nadchodzące legs.
 * Unsupported currencies are ignored. Draft / other statuses do not count.
 */
export function computePeriodCashflow(
  transactions: readonly PeriodCashflowTx[]
): PeriodCashflowBreakdown {
  let incomePaid = 0;
  let incomeOpen = 0;
  let expensePaid = 0;
  let expenseOpen = 0;

  for (const tx of transactions) {
    if (!isSupportedLedgerCurrency(tx.currency)) continue;
    const cents = toCents(tx.amount);
    const isIncome = tx.type === "income";
    if (LEDGER.has(tx.status)) {
      if (isIncome) incomePaid += cents;
      else expensePaid += cents;
      continue;
    }
    if (OPEN.has(tx.status)) {
      if (isIncome) incomeOpen += cents;
      else expenseOpen += cents;
    }
  }

  const income = leg(incomePaid, incomeOpen);
  const expense = leg(expensePaid, expenseOpen);
  return {
    income,
    expense,
    realizedNet: fromCents(incomePaid - expensePaid),
    projectedNet: fromCents(incomePaid + incomeOpen - (expensePaid + expenseOpen)),
  };
}
