/** JakStoimy currently presents ledger totals in one currency only. */
export const SUPPORTED_LEDGER_CURRENCY = "PLN";

export function normalizeLedgerCurrency(currency: unknown): string {
  return typeof currency === "string" ? currency.trim().toUpperCase() : "";
}

export function isSupportedLedgerCurrency(currency: unknown): boolean {
  return normalizeLedgerCurrency(currency) === SUPPORTED_LEDGER_CURRENCY;
}
