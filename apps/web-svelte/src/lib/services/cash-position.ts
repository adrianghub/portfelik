import { addLocalDays, localDateIso } from "$lib/date-local";
import { supabase } from "$lib/supabase";
import type { CashPosition } from "$lib/types";

/** Minimal transaction shape the position engine needs. */
export interface PositionTx {
  type: "income" | "expense";
  amount: number; // always absolute; sign comes from `type`
  status: string; // 'paid' counts toward live balance; others are forecast
  date: string; // ISO date or timestamp; compared date-only (transactions.date is timestamptz)
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

type Anchor = Pick<CashPosition, "opening_amount" | "as_of_date"> | null;

/** Date-only (YYYY-MM-DD) prefix, so a timestamptz value compares against a bare as_of_date. */
function dateOnly(d: string): string {
  return d.slice(0, 10);
}

function openingOf(anchor: Anchor): number {
  return anchor ? anchor.opening_amount : 0;
}

function asOfOf(anchor: Anchor): string {
  // No anchor → epoch, so every transaction is on/after it.
  return anchor ? anchor.as_of_date : "0000-01-01";
}

function signed(tx: PositionTx): number {
  return tx.type === "income" ? tx.amount : -tx.amount;
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

function compareDateThenId(
  a: { date: string; id?: string },
  b: { date: string; id?: string }
): number {
  const byDate = dateOnly(a.date).localeCompare(dateOnly(b.date));
  if (byDate !== 0) return byDate;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

/**
 * Live cash balance: opening + Σ(paid income) − Σ(paid expense) for transactions
 * dated on/after the anchor's as_of_date. Never stored — derived on read.
 */
export function livePosition(anchor: Anchor, txs: PositionTx[]): number {
  const asOf = asOfOf(anchor);
  return txs
    .filter((t) => t.status === "paid" && dateOnly(t.date) >= asOf)
    .reduce((sum, t) => sum + signed(t), openingOf(anchor));
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
  const scheduled = txs
    .filter((t) => isForecastStatus(t.status) && withinForecastHorizon(t, horizonEnd))
    .reduce((sum, t) => sum + signed(t), 0);
  return livePosition(anchor, txs) + scheduled;
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
  const asOf = asOfOf(anchor);
  const paid = txs
    .filter((t) => t.status === "paid" && dateOnly(t.date) >= asOf)
    .sort(compareDateThenId);
  const result = new Map<string, number>();
  let balance = openingOf(anchor);
  for (const t of paid) {
    balance += signed(t);
    result.set(t.id, balance);
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
  const asOf = asOfOf(anchor);
  const horizonEnd = opts.horizonEnd ?? cashForecastHorizonEnd(opts.today);
  const rows = txs
    .filter(
      (t) =>
        dateOnly(t.date) >= asOf &&
        (t.status === "paid" ||
          (isForecastStatus(t.status) && withinForecastHorizon(t, horizonEnd)))
    )
    .sort(compareDateThenId);
  const result = new Map<string, number>();
  let balance = openingOf(anchor);
  for (const t of rows) {
    balance += signed(t);
    result.set(t.id, balance);
  }
  return result;
}

export interface CashPositionInput {
  opening_amount: number;
  as_of_date: string;
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
      },
      { onConflict: "owner_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as CashPosition;
}
