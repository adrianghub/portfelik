import type { ImportRow } from "$lib/services/bank-import";

/** Rows that still need judgment on the mobile exception surface. */
export function isImportExceptionRow(
  row: Pick<ImportRow, "decision" | "selected_category_id" | "suggested_category_id">
): boolean {
  if (row.decision === "duplicate") return false;
  if (row.decision === "pending") return true;
  if (row.selected_category_id == null) return true;
  return (
    row.suggested_category_id != null && row.selected_category_id !== row.suggested_category_id
  );
}

export interface ImportReviewSummary {
  ready: number;
  pending: number;
  inne: number;
  duplicates: number;
}

export function summarizeImportReview(input: {
  importRows: Array<Pick<ImportRow, "selected_category_id">>;
  pendingCount: number;
  duplicateCount: number;
}): ImportReviewSummary {
  return {
    ready: input.importRows.filter((row) => row.selected_category_id != null).length,
    pending: input.pendingCount,
    inne: input.importRows.filter((row) => row.selected_category_id == null).length,
    duplicates: input.duplicateCount,
  };
}
