import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { sumMoneyAmounts } from "$lib/money";
import {
  appendConfirmedSpendForecast,
  confirmedSpendForecastFlows,
  type SpendForecastItem,
  type SpendForecastLink,
} from "$lib/plans/spend-forecast";
import {
  forecastPosition,
  livePosition,
  type ForecastPositionOpts,
  type PositionTx,
} from "$lib/services/cash-position";
import type { SpendItemStatus } from "$lib/plans/spend";

/** Inclusive cockpit window. The 90-day cash engine stays unchanged. */
export const COCKPIT_HORIZON_DAYS = 30;

export interface CockpitLedgerTx extends PositionTx {
  id: string;
}

export interface CockpitSpendItem {
  id: string;
  amount: number;
  dueDate: string | null;
  status: SpendItemStatus;
  groupId: string | null;
}

export type CockpitScope = { kind: "private" } | { kind: "group"; groupId: string };

export interface CockpitIndicatorInput {
  scope: CockpitScope;
  /** Null when this scope has no cash anchor. That is missing data, not zero. */
  anchor: { opening_amount: number; as_of_date: string } | null;
  /**
   * Ledger rows for the selected scope only. One pool per scope, so a movement
   * is one row. There is no second account balance to add.
   */
  transactions: readonly CockpitLedgerTx[];
  items: readonly CockpitSpendItem[];
  links: readonly SpendForecastLink[];
  today: string;
}

export interface CockpitIndicators {
  balance: number | null;
  /** Confirmed obligations due today through the next 30 days. */
  payments30: number;
  /** Confirmed obligations already past their date. Kept out of payments30. */
  overdue: number;
  /** Dated unconfirmed lines in the same window. Not an obligation. */
  orientational30: number;
  /** Existing cash forecast at 30 days. Null without an anchor. */
  forecast30: number | null;
  /**
   * No saved buffer exists, so a gauge arc would be an arbitrary percent.
   * The indicators show the amount alone.
   */
  arcScale: null;
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function scopedItems(input: CockpitIndicatorInput): CockpitSpendItem[] {
  return input.items.filter((item) =>
    input.scope.kind === "private" ? item.groupId === null : item.groupId === input.scope.groupId
  );
}

/** The private forecast helper ignores group ids. Scope filtering happens first. */
function asPrivateItems(items: readonly CockpitSpendItem[]): SpendForecastItem[] {
  return items.map((item) => ({ ...item, groupId: null }));
}

function isOpenExpense(tx: CockpitLedgerTx): boolean {
  return (
    tx.type === "expense" &&
    isSupportedLedgerCurrency(tx.currency) &&
    (tx.status === "upcoming" || tx.status === "overdue")
  );
}

/**
 * Saldo, płatności and prognoza for one scope. Forecast is the existing cash
 * engine plus confirmed remainders, not balance minus payments.
 */
export function cockpitIndicators(input: CockpitIndicatorInput): CockpitIndicators {
  const today = dateOnly(input.today);
  const horizonEnd = addLocalDays(today, COCKPIT_HORIZON_DAYS);
  const items = scopedItems(input);
  const forecastOpts: ForecastPositionOpts = { today, horizonEnd };
  const openExpenses = input.transactions.filter(isOpenExpense);
  const countedIds = new Set(openExpenses.map((tx) => tx.id));

  let paymentsCents = 0;
  let overdueCents = 0;
  for (const tx of openExpenses) {
    const due = dateOnly(tx.date);
    const cents = Math.round(tx.amount * 100);
    if (tx.status === "overdue" || due < today) overdueCents += cents;
    else if (due <= horizonEnd) paymentsCents += cents;
  }

  const confirmedFlows = confirmedSpendForecastFlows({
    items: asPrivateItems(items.filter((item) => item.status === "confirmed")),
    links: input.links,
    forecastTransactionIds: countedIds,
    today,
  });
  for (const flow of confirmedFlows) {
    const due = dateOnly(flow.date);
    const cents = Math.round(flow.amount * 100);
    if (flow.status === "overdue" || due < today) overdueCents += cents;
    else if (due <= horizonEnd) paymentsCents += cents;
  }

  const orientationalFlows = confirmedSpendForecastFlows({
    items: asPrivateItems(
      items
        .filter((item) => item.status === "planned")
        .map((item) => ({ ...item, status: "confirmed" as const }))
    ),
    links: input.links,
    forecastTransactionIds: countedIds,
    today,
  });
  const orientational30 = sumMoneyAmounts(
    orientationalFlows.filter((flow) => {
      const due = dateOnly(flow.date);
      return due >= today && due <= horizonEnd;
    })
  );

  const ledger = [...input.transactions];
  const balance = input.anchor ? livePosition(input.anchor, ledger) : null;
  const forecast30 = input.anchor
    ? forecastPosition(
        input.anchor,
        appendConfirmedSpendForecast(
          ledger,
          {
            items: asPrivateItems(items.filter((item) => item.status === "confirmed")),
            links: input.links,
          },
          today
        ),
        forecastOpts
      )
    : null;

  return {
    balance,
    payments30: paymentsCents / 100,
    overdue: overdueCents / 100,
    orientational30,
    forecast30,
    arcScale: null,
  };
}
