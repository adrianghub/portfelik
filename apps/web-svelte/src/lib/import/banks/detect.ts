// Back-compat shim. New code imports from ./registry.
import { detectImportAdapter, getImportAdapter } from "./registry";
import type { BankKind } from "./types";

/** @deprecated use detectImportAdapter (returns confidence). */
export function detectBank(text: string): BankKind | null {
  const result = detectImportAdapter(text);
  if (result && (result.kind === "mbank" || result.kind === "ing")) return result.kind;
  return null;
}

export { detectImportAdapter, getImportAdapter };
/** @deprecated use getImportAdapter. */
export const getAdapter = getImportAdapter;
