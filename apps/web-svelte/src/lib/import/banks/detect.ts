// Adapter auto-detection from decoded CSV text.
// Cheap header sniff — no heavy parsing.

import { parseCsv } from "../csv/parse";
import { ingAdapter } from "./ing";
import { mbankAdapter } from "./mbank";
import type { BankAdapter, BankKind } from "./types";

const adapters: BankAdapter[] = [mbankAdapter, ingAdapter];

export function detectBank(text: string): BankKind | null {
  const csv = parseCsv(text);

  // mBank + ING both put a metadata preamble before the real header.
  // Scan ALL rows so the detect heuristics get a chance to find the
  // header that matches each adapter.
  for (const adapter of adapters) {
    for (const row of csv.rows) {
      if (adapter.detect(row)) return adapter.kind;
    }
  }
  return null;
}

export function getAdapter(kind: BankKind): BankAdapter {
  if (kind === "mbank") return mbankAdapter;
  if (kind === "ing") return ingAdapter;
  throw new Error(`unknown_bank_kind: ${kind}`);
}
