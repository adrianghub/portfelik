import { addLocalDays, localDateIso } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { supabase } from "$lib/supabase";
import type { CashPosition } from "$lib/types";

/**
 * How `opening_amount` relates to `as_of_date`.
 * `start_of_day` is the historical contract: the amount is the balance before
 * movements on that date, and those movements are added.
 * `end_of_day` is a confirmed bank balance: the amount already includes every
 * booked movement on that date, so they must not be added again.
 * Missing or unknown values stay `start_of_day`, so existing rows do not move.
 */
export type CashBalanceSemantics = "start_of_day" | "end_of_day";

export interface CashAnchor {
  opening_amount: number;
  as_of_date: string;
  balance_semantics?: CashBalanceSemantics | null;
}

/** Minimal transaction shape the position engine needs. */
export interface PositionTx {
  type: "income" | "expense";
  amount: number; // always absolute; sign comes from `type`
  status: string; // 'paid' counts toward live balance; others are forecast
  date: string; // ISO date or timestamp; compared date-only (transactions.date is timestamptz)
  currency: string;
}

/** Paid + scheduled rows that also carry an id (running-balance maps). */
export interface RunningBalanceTx extends PositionTx {
  id: string;
}

/**
 * Inclusive forecast window from today (local). Real upcoming/overdue and
 * recurring projections share this horizon so browsing months cannot change
 * the personal cash forecast without a financial change.
 */
export const CASH_FORECAST_HORIZON_DAYS = 90;

/** Exclusive upper bound for fetches that use `.lt(date, end)`. */
export const CASH_FETCH_END_SENTINEL = "9999-12-31";

type Anchor = CashAnchor | null;

/** Date-only (YYYY-MM-DD) prefix, so a timestamptz value compares against a bare as_of_date. */
function dateOnly(d: string): string {
  return d.slice(0, 10);
}

export function cashBalanceSemantics(anchor: Anchor): CashBalanceSemantics {
  return anchor?.balance_semantics === "end_of_day" ? "end_of_day" : "start_of_day";
}

/** Last calendar day already included in `opening_amount`. */
export function anchorIncludedThrough(anchor: CashAnchor): string {
  const asOf = dateOnly(anchor.as_of_date);
  if (cashBalanceSemantics(anchor) === "end_of_day") return asOf;
  return addLocalDays(asOf, -1);
}

/** First calendar day whose movements are added on top of `opening_amount`. */
export function anchorOpenFrom(anchor: CashAnchor): string {
  return addLocalDays(anchorIncludedThrough(anchor), 1);
}

/** True when this row is strictly after the anchor instant. */
export function countsAfterAnchor(date: string, anchor: Anchor): boolean {
  if (!anchor) return true;
  return dateOnly(date) >= anchorOpenFrom(anchor);
}

export function compareCashRowOrder(
  a: { date: string; id?: string },
  b: { date: string; id?: string }
): number {
  const byDate = dateOnly(a.date).localeCompare(dateOnly(b.date));
  if (byDate !== 0) return byDate;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(amount: number): number {
  return amount / 100;
}

function openingCents(anchor: Anchor): number {
  return toCents(anchor ? anchor.opening_amount : 0);
}

function signedCents(tx: PositionTx): number {
  const amount = toCents(tx.amount);
  return tx.type === "income" ? amount : -amount;
}

/** Paid PLN movement in grosze. Null when the row stays out of the cash pool. */
export function bookedCashCents(tx: PositionTx): number | null {
  if (!isSupportedLedgerCurrency(tx.currency) || tx.status !== "paid") return null;
  return signedCents(tx);
}

export function cashForecastHorizonEnd(today: string = localDateIso()): string {
  return addLocalDays(today.slice(0, 10), CASH_FORECAST_HORIZON_DAYS);
}

/** Exclusive end for projection helpers that treat `spanEnd` as exclusive. */
export function cashForecastProjectionEnd(today: string = localDateIso()): string {
  return addLocalDays(cashForecastHorizonEnd(today), 1);
}

function isForecastStatus(status: string): boolean {
  return status === "upcoming" || status === "overdue";
}

function withinForecastHorizon(tx: PositionTx, horizonEnd: string): boolean {
  return dateOnly(tx.date) <= horizonEnd;
}

/**
 * Live cash balance: opening plus booked movements after the anchor instant.
 * `start_of_day` includes `as_of_date`. `end_of_day` starts the next day.
 * Never stored — derived on read.
 */
export function livePosition(anchor: Anchor, txs: PositionTx[]): number {
  const balanceCents = txs
    .filter(
      (t) =>
        isSupportedLedgerCurrency(t.currency) &&
        t.status === "paid" &&
        countsAfterAnchor(t.date, anchor)
    )
    .reduce((sum, t) => sum + signedCents(t), openingCents(anchor));
  return fromCents(balanceCents);
}

/** Recorded movements explain the current balance separately from its forecast. */
export function liveMovementTotals(
  anchor: Anchor,
  txs: PositionTx[]
): {
  paidIncome: number;
  paidExpenses: number;
} {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const tx of txs) {
    if (
      !isSupportedLedgerCurrency(tx.currency) ||
      tx.status !== "paid" ||
      !countsAfterAnchor(tx.date, anchor)
    )
      continue;
    if (tx.type === "income") incomeCents += toCents(tx.amount);
    else expenseCents += toCents(tx.amount);
  }
  return { paidIncome: fromCents(incomeCents), paidExpenses: fromCents(expenseCents) };
}

export interface ForecastPositionOpts {
  /** Local YYYY-MM-DD; defaults to today. */
  today?: string;
  /** Inclusive horizon end; defaults to today + CASH_FORECAST_HORIZON_DAYS. */
  horizonEnd?: string;
}

/**
 * Live balance plus upcoming and overdue rows on/before the forecast horizon.
 * Far-future scheduled rows beyond the horizon are ignored so the strip does
 * not silently include year-9999 obligations while projections stop sooner.
 */
export function forecastPosition(
  anchor: Anchor,
  txs: PositionTx[],
  opts: ForecastPositionOpts = {}
): number {
  const horizonEnd = opts.horizonEnd ?? cashForecastHorizonEnd(opts.today);
  const scheduledCents = txs
    .filter(
      (t) =>
        isSupportedLedgerCurrency(t.currency) &&
        isForecastStatus(t.status) &&
        countsAfterAnchor(t.date, anchor) &&
        withinForecastHorizon(t, horizonEnd)
    )
    .reduce((sum, t) => sum + signedCents(t), 0);
  return fromCents(toCents(livePosition(anchor, txs)) + scheduledCents);
}

export interface ForecastMovementTotals {
  upcomingIncome: number;
  upcomingExpenses: number;
}

/** Upcoming and overdue amounts inside the forecast horizon. Paid rows stay in the live balance. */
export function forecastMovementTotals(
  anchor: Anchor,
  txs: PositionTx[],
  opts: ForecastPositionOpts = {}
): ForecastMovementTotals {
  const horizonEnd = opts.horizonEnd ?? cashForecastHorizonEnd(opts.today);
  let incomeCents = 0;
  let expenseCents = 0;
  for (const tx of txs) {
    if (!isSupportedLedgerCurrency(tx.currency)) continue;
    if (!isForecastStatus(tx.status)) continue;
    if (!countsAfterAnchor(tx.date, anchor) || !withinForecastHorizon(tx, horizonEnd)) continue;
    const cents = toCents(tx.amount);
    if (tx.type === "income") incomeCents += cents;
    else expenseCents += cents;
  }
  return {
    upcomingIncome: fromCents(incomeCents),
    upcomingExpenses: fromCents(expenseCents),
  };
}

/** Fetch the private cash position for the signed-in user (null if not set yet). */
export async function fetchPrivateCashPosition(): Promise<CashPosition | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("cash_positions")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as CashPosition | null) ?? null;
}

/**
 * Balance-after-each-row for paid transactions on/after the anchor's as_of_date,
 * accumulated in chronological order (date, then id). Keyed by tx id. Rows
 * before the anchor or not paid are omitted. Pure — caller fetches the paid
 * history since as_of_date.
 */
export function runningBalances(anchor: Anchor, txs: RunningBalanceTx[]): Map<string, number> {
  const paid = txs
    .filter(
      (t) =>
        isSupportedLedgerCurrency(t.currency) &&
        t.status === "paid" &&
        countsAfterAnchor(t.date, anchor)
    )
    .sort(compareCashRowOrder);
  const result = new Map<string, number>();
  let balanceCents = openingCents(anchor);
  for (const t of paid) {
    balanceCents += signedCents(t);
    result.set(t.id, fromCents(balanceCents));
  }
  return result;
}

/**
 * Forecast balance-after-each-row: continues the live balance through paid,
 * upcoming, and overdue rows on/after the anchor and on/before the horizon,
 * in chronological order (date, then id).
 */
export function forecastRunningBalances(
  anchor: Anchor,
  txs: RunningBalanceTx[],
  opts: ForecastPositionOpts = {}
): Map<string, number> {
  const horizonEnd = opts.horizonEnd ?? cashForecastHorizonEnd(opts.today);
  const rows = txs
    .filter(
      (t) =>
        isSupportedLedgerCurrency(t.currency) &&
        countsAfterAnchor(t.date, anchor) &&
        (t.status === "paid" ||
          (isForecastStatus(t.status) && withinForecastHorizon(t, horizonEnd)))
    )
    .sort(compareCashRowOrder);
  const result = new Map<string, number>();
  let balanceCents = openingCents(anchor);
  for (const t of rows) {
    balanceCents += signedCents(t);
    result.set(t.id, fromCents(balanceCents));
  }
  return result;
}

export interface CashPositionInput {
  opening_amount: number;
  as_of_date: string;
  /** Omit only for a writer that must keep the stored semantics. */
  balance_semantics?: CashBalanceSemantics;
}

/** Create or update the private cash position (one row per user, keyed by owner_id). */
export async function upsertPrivateCashPosition(input: CashPositionInput): Promise<CashPosition> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("cash_positions")
    .upsert(
      {
        owner_id: user.id,
        opening_amount: input.opening_amount,
        as_of_date: input.as_of_date,
        ...(input.balance_semantics ? { balance_semantics: input.balance_semantics } : {}),
      },
      { onConflict: "owner_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as CashPosition;
}
