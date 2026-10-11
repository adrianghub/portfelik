import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { sumMoneyAmounts } from "$lib/money";
import { confirmedSpendForecastFlows, type SpendForecastLink } from "$lib/plans/spend-forecast";
import {
  CASH_FORECAST_HORIZON_DAYS,
  forecastPosition,
  livePosition,
  type PositionTx,
} from "$lib/services/cash-position";
import {
  type CockpitLedgerTx,
  type CockpitScope,
  type CockpitSpendItem,
} from "$lib/cockpit/indicators";

/**
 * Calendar month for the three Kokpit counters. This is not the rolling
 * 30-day window. Names stay Stan salda, Wydatki, and Prognoza.
 */
export type CockpitMonthScope = CockpitScope | { kind: "all" };

export interface CockpitMonthInput {
  scope: CockpitMonthScope;
  /** Null when this scope has no cash anchor. Missing data, not zero. */
  anchor: { opening_amount: number; as_of_date: string } | null;
  /** Ledger rows for one scope. "All" may include every row the caller can read. */
  transactions: readonly CockpitLedgerTx[];
  items: readonly CockpitSpendItem[];
  links: readonly SpendForecastLink[];
  today: string;
  /** Inclusive calendar bounds, YYYY-MM-DD. */
  monthStart: string;
  monthEnd: string;
  /**
   * Goal transfers already counted as allocations. They stay in the cash
   * balance and stay out of Wydatki.
   */
  allocationTransactionIds?: ReadonlySet<string>;
}

export interface CockpitMonthIndicators {
  /** Stan salda. Null when the scope has no single pool or the date is before the anchor. */
  balance: number | null;
  /**
   * Wydatki. Zero is a real empty month. Null when the whole month is before
   * the anchor, because those movements are already inside the opening amount.
   */
  expenses: number | null;
  /**
   * Prognoza. For a past month this is the balance calculated at month end
   * from the anchor and paid history. Null when the forecast end is outside
   * the engine horizon, so a partial month is never shown as complete.
   */
  forecast: number | null;
  /** Planned lines in the month. Visible beside Wydatki, never inside it. */
  orientational: number;
}

function day(value: string): string {
  return value.slice(0, 10);
}

function relationOf(
  today: string,
  monthStart: string,
  monthEnd: string
): "past" | "current" | "future" {
  if (monthEnd < today) return "past";
  if (monthStart > today) return "future";
  return "current";
}

function scopedItems(input: CockpitMonthInput): CockpitSpendItem[] {
  if (input.scope.kind === "all") return [];
  const scope = input.scope;
  return input.items.filter((item) =>
    scope.kind === "private" ? item.groupId === null : item.groupId === scope.groupId
  );
}

function asPrivateItems(items: readonly CockpitSpendItem[]): CockpitSpendItem[] {
  return items.map((item) => ({ ...item, groupId: null }));
}

function isExpense(tx: CockpitLedgerTx, allocationIds: ReadonlySet<string>): boolean {
  return (
    tx.type === "expense" && isSupportedLedgerCurrency(tx.currency) && !allocationIds.has(tx.id)
  );
}

function paidOnOrBefore(
  anchor: NonNullable<CockpitMonthInput["anchor"]>,
  transactions: readonly CockpitLedgerTx[],
  inclusiveEnd: string
): number | null {
  if (inclusiveEnd < anchor.as_of_date) return null;
  return livePosition(
    anchor,
    transactions.filter((tx) => day(tx.date) <= inclusiveEnd)
  );
}

function forecastThrough(
  anchor: NonNullable<CockpitMonthInput["anchor"]>,
  transactions: readonly CockpitLedgerTx[],
  items: readonly CockpitSpendItem[],
  links: readonly SpendForecastLink[],
  today: string,
  inclusiveEnd: string
): number | null {
  if (inclusiveEnd < anchor.as_of_date) return null;
  const horizonEnd = addLocalDays(today, CASH_FORECAST_HORIZON_DAYS);
  if (inclusiveEnd > horizonEnd) return null;
  const ledger = transactions.filter((tx) => day(tx.date) <= inclusiveEnd);
  return forecastPosition(
    anchor,
    [
      ...ledger,
      ...confirmedSpendForecastFlows({
        items: asPrivateItems(items.filter((item) => item.status === "confirmed")),
        links,
        forecastTransactionIds: new Set(ledger.map((tx) => tx.id)),
        today,
      }),
    ],
    { today, horizonEnd: inclusiveEnd }
  );
}

function expenseFlows(
  items: readonly CockpitSpendItem[],
  links: readonly SpendForecastLink[],
  countedIds: ReadonlySet<string>,
  today: string,
  status: "confirmed" | "planned"
): PositionTx[] {
  const source =
    status === "planned"
      ? items
          .filter((item) => item.status === "planned")
          .map((item) => ({ ...item, status: "confirmed" as const }))
      : items.filter((item) => item.status === "confirmed");
  return confirmedSpendForecastFlows({
    items: asPrivateItems(source),
    links,
    forecastTransactionIds: countedIds,
    today,
  });
}

function inMonth(date: string, monthStart: string, monthEnd: string): boolean {
  const value = day(date);
  return value >= monthStart && value <= monthEnd;
}

/**
 * Stan salda, Wydatki, and Prognoza for one calendar month.
 * "All" never adds private and household cash together.
 */
export function cockpitMonthIndicators(input: CockpitMonthInput): CockpitMonthIndicators {
  const today = day(input.today);
  const monthStart = day(input.monthStart);
  const monthEnd = day(input.monthEnd);
  const relation = relationOf(today, monthStart, monthEnd);
  const allocationIds = input.allocationTransactionIds ?? new Set<string>();
  const items = scopedItems(input);
  const sharedPool = input.scope.kind !== "all" && input.anchor != null;
  const anchor = sharedPool ? input.anchor : null;

  const balance = (() => {
    if (!anchor) return null;
    if (monthStart < anchor.as_of_date && relation !== "current") return null;
    if (relation === "past") {
      return livePosition(
        anchor,
        input.transactions.filter((tx) => day(tx.date) < monthStart)
      );
    }
    if (relation === "current") {
      if (today < anchor.as_of_date) return null;
      return livePosition(anchor, [...input.transactions]);
    }
    const dayBefore = addLocalDays(monthStart, -1);
    if (dayBefore < anchor.as_of_date) return livePosition(anchor, []);
    return forecastThrough(anchor, input.transactions, items, input.links, today, dayBefore);
  })();

  const forecast = (() => {
    if (!anchor) return null;
    if (relation === "past") return paidOnOrBefore(anchor, input.transactions, monthEnd);
    return forecastThrough(anchor, input.transactions, items, input.links, today, monthEnd);
  })();

  const monthBeforeAnchor = anchor != null && monthEnd < anchor.as_of_date;
  const countedExpenses = input.transactions.filter((tx) => {
    if (monthBeforeAnchor) return false;
    if (anchor && day(tx.date) < anchor.as_of_date) return false;
    if (!isExpense(tx, allocationIds) || !inMonth(tx.date, monthStart, monthEnd)) return false;
    if (relation === "past") return tx.status === "paid";
    if (tx.status === "paid") return day(tx.date) <= today;
    if (tx.status !== "upcoming" && tx.status !== "overdue") return false;
    return true;
  });
  const countedIds = new Set(countedExpenses.map((tx) => tx.id));
  const knownFlow = (flow: PositionTx) =>
    inMonth(flow.date, monthStart, monthEnd) &&
    (anchor == null || day(flow.date) >= anchor.as_of_date);
  const remainders =
    relation === "past" || monthBeforeAnchor
      ? []
      : expenseFlows(items, input.links, countedIds, today, "confirmed").filter(knownFlow);
  const orientational = sumMoneyAmounts(
    expenseFlows(items, input.links, countedIds, today, "planned").filter(knownFlow)
  );

  return {
    balance,
    expenses: monthBeforeAnchor ? null : sumMoneyAmounts([...countedExpenses, ...remainders]),
    forecast,
    orientational,
  };
}
