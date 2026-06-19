import type { RowDecision } from "$lib/services/bank-import";

/**
 * Default import decision for a parsed row.
 *
 * Card holds (blokady) are unsettled, so they default to 'pending' — the
 * commit RPC refuses to commit a session while any row is pending, forcing
 * the user to explicitly keep (→import) or drop (→skip) each one. Releases
 * (zwolnienie blokady, parsed as is_hold income) are not spend → default skip.
 */
export function decisionForRow(row: {
  is_hold?: boolean;
  type: "income" | "expense";
}): RowDecision {
  if (row.is_hold) return row.type === "income" ? "skip" : "pending";
  return "import";
}
