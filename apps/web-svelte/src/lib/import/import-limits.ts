import {
  isSupportedLedgerCurrency,
  normalizeLedgerCurrency,
  SUPPORTED_LEDGER_CURRENCY,
} from "$lib/ledger-currency";

/** Client-side bank CSV upload limits (WebView-safe). */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 20_000;
export const SUPPORTED_IMPORT_CURRENCY = SUPPORTED_LEDGER_CURRENCY;

export type ImportLimitViolation = "file_too_large" | "too_many_rows";

export function checkImportFileSize(byteLength: number): "file_too_large" | null {
  if (!Number.isFinite(byteLength) || byteLength < 0) return "file_too_large";
  if (byteLength > IMPORT_MAX_FILE_BYTES) return "file_too_large";
  return null;
}

export function checkImportRowCount(rowCount: number): "too_many_rows" | null {
  if (!Number.isFinite(rowCount) || rowCount < 0) return "too_many_rows";
  if (rowCount > IMPORT_MAX_ROWS) return "too_many_rows";
  return null;
}

export type ImportFileReadResult =
  { ok: true; bytes: ArrayBuffer } | { ok: false; violation: "file_too_large" };

/**
 * Read an import file without first loading an obviously oversized file into
 * memory. The second check protects against file-like objects that report an
 * incorrect size.
 */
export async function readImportFileBytes(
  file: Pick<File, "size" | "arrayBuffer">
): Promise<ImportFileReadResult> {
  const reportedSizeViolation = checkImportFileSize(file.size);
  if (reportedSizeViolation) return { ok: false, violation: reportedSizeViolation };

  const bytes = await file.arrayBuffer();
  const actualSizeViolation = checkImportFileSize(bytes.byteLength);
  if (actualSizeViolation) return { ok: false, violation: actualSizeViolation };

  return { ok: true, bytes };
}

/** Unique unsupported currencies in a stable order for validation and copy. */
export function findUnsupportedImportCurrencies(rows: readonly { currency: string }[]): string[] {
  const unsupported = new Set<string>();
  for (const row of rows) {
    const currency = normalizeLedgerCurrency(row.currency);
    if (!isSupportedLedgerCurrency(currency)) unsupported.add(currency || "BRAK WALUTY");
  }
  return [...unsupported].sort((a, b) => a.localeCompare(b, "pl"));
}
