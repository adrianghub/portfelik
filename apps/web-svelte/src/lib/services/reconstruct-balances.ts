import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import {
  anchorIncludedThrough,
  bookedCashCents,
  cashBalanceSemantics,
  compareCashRowOrder,
  type CashAnchor,
  type CashBalanceSemantics,
  type PositionTx,
} from "$lib/services/cash-position";

/**
 * End-of-day balances around one confirmed anchor.
 *
 * S(d) = S(T) − Σ Δ(t) for d < t ≤ T, where T is the last day already inside
 * the stored amount. Later booked days add Δ(t) for T < t ≤ d.
 *
 * The function does not invent movements, mark an import as complete, or
 * change `livePosition`. A private PLN pool has no per-account split and no
 * transfer type: both sides of an internal transfer count when they were
 * imported as income and expense.
 */
export type HistoricalBalanceQuality = "reconstructed" | "confirmed" | "booked";

export interface HistoricalBalanceTx extends PositionTx {
  id?: string;
}

export interface HistoricalBalancePoint {
  /** End of this calendar day. The prefix of a timestamp, not a Warsaw conversion. */
  date: string;
  amount: number;
  quality: HistoricalBalanceQuality;
}

export interface HistoricalBalanceSeries {
  points: HistoricalBalancePoint[];
  confirmedDate: string;
  confirmedAmount: number;
  semantics: CashBalanceSemantics;
  /** Earliest paid PLN date in the input. Null when none exist. */
  historyStart: string | null;
  /** A paid non-PLN row was ignored. Currencies are never converted. */
  excludedForeignCurrency: boolean;
  /** At least one point is calculated backward from the anchor. */
  reconstructed: boolean;
  /**
   * Balance after each paid PLN row, in date then id order.
   * This is the intra-day figure. `points` stay at end of day.
   */
  afterTransaction: Map<string, number>;
}

function day(value: string): string {
  return value.slice(0, 10);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Reconstruct end-of-day balances from one anchor and the supplied rows.
 * Points start at the first available movement, not before it, plus the
 * end of the previous day when that day falls inside `from`.
 */
export function reconstructHistoricalBalances(input: {
  anchor: CashAnchor;
  transactions: readonly HistoricalBalanceTx[];
  /** Inclusive. Defaults to the day before the first movement, or the confirmed day. */
  from?: string;
  /** Include carried end-of-day values for interactive historical analysis. */
  daily?: boolean;
  /** Inclusive. Defaults to the confirmed day. */
  to?: string;
}): HistoricalBalanceSeries {
  const semantics = cashBalanceSemantics(input.anchor);
  const confirmedDate = anchorIncludedThrough(input.anchor);
  const confirmedCents = Math.round(input.anchor.opening_amount * 100);
  const openFrom = addLocalDays(confirmedDate, 1);
  const nets = new Map<string, number>();
  const paid: HistoricalBalanceTx[] = [];
  let excludedForeignCurrency = false;
  let historyStart: string | null = null;

  for (const tx of input.transactions) {
    if (tx.status === "paid" && !isSupportedLedgerCurrency(tx.currency)) {
      excludedForeignCurrency = true;
    }
    const cents = bookedCashCents(tx);
    if (cents == null) continue;
    const date = day(tx.date);
    nets.set(date, (nets.get(date) ?? 0) + cents);
    paid.push(tx);
    if (historyStart == null || date < historyStart) historyStart = date;
  }

  const netDates = [...nets.keys()].sort();
  const prefixes = [0];
  for (const date of netDates) prefixes.push(prefixes.at(-1)! + nets.get(date)!);
  const through = (date: string): number => {
    let left = 0,
      right = netDates.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (netDates[middle] <= date) left = middle + 1;
      else right = middle;
    }
    return prefixes[left];
  };
  const sumBetween = (start: string, end: string) =>
    start > end ? 0 : through(end) - through(addLocalDays(start, -1));

  const endOf = (date: string): number => {
    if (date <= confirmedDate) {
      return confirmedCents - sumBetween(addLocalDays(date, 1), confirmedDate);
    }
    return confirmedCents + sumBetween(openFrom, date);
  };

  const startOf = (date: string): number => {
    if (date <= confirmedDate) return confirmedCents - sumBetween(date, confirmedDate);
    return confirmedCents + sumBetween(openFrom, addLocalDays(date, -1));
  };

  const afterTransaction = new Map<string, number>();
  let cursor = "";
  let running = confirmedCents;
  for (const tx of [...paid].sort(compareCashRowOrder)) {
    const date = day(tx.date);
    if (date !== cursor) {
      running = startOf(date);
      cursor = date;
    }
    const cents = bookedCashCents(tx);
    if (cents == null) continue;
    running += cents;
    if (tx.id) afterTransaction.set(tx.id, fromCents(running));
  }

  const defaultFrom = historyStart != null ? addLocalDays(historyStart, -1) : confirmedDate;
  const from = day(input.from ?? defaultFrom);
  const to = day(input.to ?? confirmedDate);
  const dates = new Set<string>();
  if (from <= to) {
    if (confirmedDate >= from && confirmedDate <= to) dates.add(confirmedDate);
    for (const date of nets.keys()) {
      if (date >= from && date <= to) dates.add(date);
    }
    if (
      historyStart != null &&
      historyStart <= confirmedDate &&
      addLocalDays(historyStart, -1) >= from &&
      addLocalDays(historyStart, -1) <= to
    ) {
      dates.add(addLocalDays(historyStart, -1));
    }
    // A quiet week still needs its left edge. The balance there is carried,
    // not invented, and it never starts before the first known movement.
    if (
      historyStart != null &&
      from >= addLocalDays(historyStart, -1) &&
      from <= to &&
      from <= confirmedDate
    ) {
      dates.add(from);
    }
    if (historyStart != null && to <= confirmedDate && to >= historyStart && to >= from) {
      dates.add(to);
    }
  }

  if (input.daily && from <= to) {
    const reliableFrom =
      historyStart == null
        ? confirmedDate
        : [confirmedDate, addLocalDays(historyStart, -1)].sort()[0];
    for (
      let date = from > reliableFrom ? from : reliableFrom;
      date <= to;
      date = addLocalDays(date, 1)
    ) {
      dates.add(date);
    }
  }

  const points = [...dates]
    .sort()
    .filter((date) => {
      if (date >= confirmedDate || historyStart == null) return true;
      return date >= addLocalDays(historyStart, -1);
    })
    .map((date) => ({
      date,
      amount: fromCents(endOf(date)),
      quality: (date === confirmedDate
        ? "confirmed"
        : date < confirmedDate
          ? "reconstructed"
          : "booked") as HistoricalBalanceQuality,
    }));

  return {
    points,
    confirmedDate,
    confirmedAmount: fromCents(confirmedCents),
    semantics,
    historyStart,
    excludedForeignCurrency,
    reconstructed: points.some((point) => point.quality === "reconstructed"),
    afterTransaction,
  };
}
