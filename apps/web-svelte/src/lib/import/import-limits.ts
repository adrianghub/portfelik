/** Client-side bank CSV upload limits (WebView-safe). */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 20_000;

export type ImportLimitViolation = "file_too_large" | "too_many_rows";

export function checkImportFileSize(byteLength: number): ImportLimitViolation | null {
  if (!Number.isFinite(byteLength) || byteLength < 0) return "file_too_large";
  if (byteLength > IMPORT_MAX_FILE_BYTES) return "file_too_large";
  return null;
}

export function checkImportRowCount(rowCount: number): ImportLimitViolation | null {
  if (!Number.isFinite(rowCount) || rowCount < 0) return "too_many_rows";
  if (rowCount > IMPORT_MAX_ROWS) return "too_many_rows";
  return null;
}
