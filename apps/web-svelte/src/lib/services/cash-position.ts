import type { CashPosition } from "$lib/types";

/** Minimal transaction shape the position engine needs. */
export interface PositionTx {
  type: "income" | "expense";
  amount: number; // always absolute; sign comes from `type`
  status: string; // 'paid' counts toward live balance; others are forecast
  date: string; // ISO date
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
    .filter((t) => t.status === "paid" && t.date >= asOf)
    .reduce((sum, t) => sum + signed(t), openingOf(anchor));
}

/** Live balance plus all `upcoming` transactions (forecast horizon). */
export function forecastPosition(anchor: Anchor, txs: PositionTx[]): number {
  const upcoming = txs
    .filter((t) => t.status === "upcoming")
    .reduce((sum, t) => sum + signed(t), 0);
  return livePosition(anchor, txs) + upcoming;
}
