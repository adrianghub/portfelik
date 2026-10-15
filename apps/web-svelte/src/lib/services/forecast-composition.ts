import { moneyDifference, sumMoneyAmounts } from "$lib/money";
import {
  anchorOpenFrom,
  forecastMovementTotals,
  liveMovementTotals,
  livePosition,
  type CashAnchor,
  type PositionTx,
} from "$lib/services/cash-position";

/**
 * Complete "Skąd ta kwota?" breakdown for a forecast end balance.
 * Composition uses the same paid / upcoming / remainder rules as Kokpit.
 */
export interface ForecastComposition {
  /** Live cash today (paid only). */
  balanceToday: number;
  /** Anchor opening that seeds live cash. */
  openingAmount: number;
  /** Paid income after the anchor that shapes balanceToday. */
  paidIncome: number;
  /** Paid expenses after the anchor that shape balanceToday. */
  paidExpenses: number;
  upcomingIncome: number;
  /** Ledger upcoming/overdue expenses only (matches /transactions drill). */
  ledgerUpcomingExpenses: number;
  /** Confirmed plan remainders folded into the forecast expense total. */
  planRemainders: number;
  /** ledgerUpcomingExpenses + planRemainders. */
  upcomingExpenses: number;
  /** First calendar day counted after the anchor. */
  openFrom: string;
  today: string;
  horizonEnd: string;
  result: number;
  /** Human-readable equation parts for the UI. */
  parts: Array<{ key: "balance" | "income" | "expense"; amount: number }>;
}

function isPlanRemainder(tx: PositionTx & { id?: string }): boolean {
  return typeof tx.id === "string" && tx.id.startsWith("spend-remainder:");
}

export function composeForecastExplanation(input: {
  anchor: CashAnchor;
  /** Ledger + synthetic remainders used for forecastPosition. */
  forecastRows: readonly (PositionTx & { id?: string })[];
  today: string;
  horizonEnd: string;
}): ForecastComposition {
  const rows = [...input.forecastRows];
  const ledgerRows = rows.filter((row) => !isPlanRemainder(row));
  const balanceToday = livePosition(input.anchor, rows);
  const paid = liveMovementTotals(input.anchor, ledgerRows);
  const ledgerMovements = forecastMovementTotals(input.anchor, ledgerRows, {
    today: input.today,
    horizonEnd: input.horizonEnd,
  });
  const allMovements = forecastMovementTotals(input.anchor, rows, {
    today: input.today,
    horizonEnd: input.horizonEnd,
  });
  const planRemainders = moneyDifference(
    allMovements.upcomingExpenses,
    ledgerMovements.upcomingExpenses
  );
  const result = moneyDifference(
    sumMoneyAmounts([{ amount: balanceToday }, { amount: allMovements.upcomingIncome }]),
    allMovements.upcomingExpenses
  );
  return {
    balanceToday,
    openingAmount: input.anchor.opening_amount,
    paidIncome: paid.paidIncome,
    paidExpenses: paid.paidExpenses,
    upcomingIncome: allMovements.upcomingIncome,
    ledgerUpcomingExpenses: ledgerMovements.upcomingExpenses,
    planRemainders,
    upcomingExpenses: allMovements.upcomingExpenses,
    openFrom: anchorOpenFrom(input.anchor),
    today: input.today.slice(0, 10),
    horizonEnd: input.horizonEnd.slice(0, 10),
    result,
    parts: [
      { key: "balance", amount: balanceToday },
      { key: "income", amount: allMovements.upcomingIncome },
      { key: "expense", amount: allMovements.upcomingExpenses },
    ],
  };
}

/** Build a Transakcje URL whose filters match one composition leg. */
export function forecastCompositionHref(input: {
  openFrom: string;
  end: string;
  status: string;
  type?: "income" | "expense";
  group?: string;
}): string {
  const p = new URLSearchParams();
  p.set("startDate", input.openFrom);
  p.set("endDate", input.end);
  p.set("group", input.group ?? "own");
  p.set("status", input.status);
  if (input.type) p.set("type", input.type);
  return `/transactions?${p.toString()}`;
}
