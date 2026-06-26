import { supabase } from "$lib/supabase";
import type { CashPosition } from "$lib/types";

/** Minimal transaction shape the position engine needs. */
export interface PositionTx {
  type: "income" | "expense";
  amount: number; // always absolute; sign comes from `type`
  status: string; // 'paid' counts toward live balance; others are forecast
  date: string; // ISO date or timestamp; compared date-only (transactions.date is timestamptz)
}

/** Date-only (YYYY-MM-DD) prefix, so a timestamptz value compares against a bare as_of_date. */
function dateOnly(d: string): string {
  return d.slice(0, 10);
}

type Anchor = Pick<CashPosition, "opening_amount" | "as_of_date"> | null;

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

/** Live balance plus all `upcoming` transactions (forecast horizon). */
export function forecastPosition(anchor: Anchor, txs: PositionTx[]): number {
  const upcoming = txs
    .filter((t) => t.status === "upcoming")
    .reduce((sum, t) => sum + signed(t), 0);
  return livePosition(anchor, txs) + upcoming;
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

/** A paid transaction with an id, for per-row running-balance display. */
export interface RunningBalanceTx extends PositionTx {
  id: string;
}

/**
 * Balance-after-each-row for paid transactions on/after the anchor's as_of_date,
 * accumulated in chronological order. Keyed by tx id. Rows before the anchor or
 * not paid are omitted. Pure — caller fetches the paid history since as_of_date.
 */
export function runningBalances(anchor: Anchor, txs: RunningBalanceTx[]): Map<string, number> {
  const asOf = asOfOf(anchor);
  const paid = txs
    .filter((t) => t.status === "paid" && dateOnly(t.date) >= asOf)
    .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)));
  const result = new Map<string, number>();
  let balance = openingOf(anchor);
  for (const t of paid) {
    balance += signed(t);
    result.set(t.id, balance);
  }
  return result;
}

/**
 * Forecast balance-after-each-row: continues the live balance through both paid
 * and upcoming rows on/after the anchor's as_of_date, in chronological order.
 * Keyed by tx id. Rows before the anchor or with other statuses (draft/overdue)
 * are omitted. Pure — caller supplies the private paid + upcoming + projected set.
 */
export function forecastRunningBalances(
  anchor: Anchor,
  txs: RunningBalanceTx[]
): Map<string, number> {
  const asOf = asOfOf(anchor);
  const rows = txs
    .filter((t) => (t.status === "paid" || t.status === "upcoming") && dateOnly(t.date) >= asOf)
    .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)));
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
