import type { ImportRow } from "$lib/services/bank-import";

export type StatementFilter = "all" | "review" | "duplicates" | "skipped";

export function needsImportReview(
  row: ImportRow,
  archivedCategoryIds?: ReadonlySet<string>
): boolean {
  return (
    row.decision === "pending" ||
    (row.decision === "import" &&
      (row.selected_category_id == null ||
        archivedCategoryIds?.has(row.selected_category_id) === true))
  );
}

/** Mutually exclusive buckets; a deliberate skip is already a decision. */
export function statementCounts(rows: ImportRow[], archivedCategoryIds?: ReadonlySet<string>) {
  return {
    all: rows.length,
    review: rows.filter((row) => needsImportReview(row, archivedCategoryIds)).length,
    duplicates: rows.filter((row) => row.decision === "duplicate").length,
    skipped: rows.filter((row) => row.decision === "skip").length,
    ready: rows.filter(
      (row) => row.decision === "import" && !needsImportReview(row, archivedCategoryIds)
    ).length,
  };
}

export function statementRows(
  rows: ImportRow[],
  filter: StatementFilter,
  archivedCategoryIds?: ReadonlySet<string>
): ImportRow[] {
  return rows.filter((row) => {
    if (filter === "review") return needsImportReview(row, archivedCategoryIds);
    if (filter === "duplicates") return row.decision === "duplicate";
    if (filter === "skipped") return row.decision === "skip";
    return true;
  });
}
