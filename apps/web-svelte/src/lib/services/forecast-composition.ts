import { moneyDifference, sumMoneyAmounts } from "$lib/money";
import {
  forecastMovementTotals,
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
  upcomingIncome: number;
  upcomingExpenses: number;
  /** Confirmed plan remainders already folded into the upcoming expense figure when present. */
  result: number;
  /** Human-readable equation parts for the UI. */
  parts: Array<{ key: "balance" | "income" | "expense"; amount: number }>;
}

export function composeForecastExplanation(input: {
  anchor: CashAnchor;
  /** Ledger + synthetic remainders used for forecastPosition. */
  forecastRows: readonly PositionTx[];
  today: string;
  horizonEnd: string;
}): ForecastComposition {
  const rows = [...input.forecastRows];
  const balanceToday = livePosition(input.anchor, rows);
  const movements = forecastMovementTotals(input.anchor, rows, {
    today: input.today,
    horizonEnd: input.horizonEnd,
  });
  const result = moneyDifference(
    sumMoneyAmounts([{ amount: balanceToday }, { amount: movements.upcomingIncome }]),
    movements.upcomingExpenses
  );
  return {
    balanceToday,
    upcomingIncome: movements.upcomingIncome,
    upcomingExpenses: movements.upcomingExpenses,
    result,
    parts: [
      { key: "balance", amount: balanceToday },
      { key: "income", amount: movements.upcomingIncome },
      { key: "expense", amount: movements.upcomingExpenses },
    ],
  };
}
