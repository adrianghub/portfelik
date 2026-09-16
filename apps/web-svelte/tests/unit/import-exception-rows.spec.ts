import { describe, expect, it } from "vitest";
import { isImportExceptionRow, summarizeImportReview } from "$lib/import/exception-rows";

describe("isImportExceptionRow", () => {
  it("treats pending and uncategorized rows as exceptions", () => {
    expect(
      isImportExceptionRow({
        decision: "pending",
        selected_category_id: "cat-1",
        suggested_category_id: "cat-1",
      })
    ).toBe(true);
    expect(
      isImportExceptionRow({
        decision: "import",
        selected_category_id: null,
        suggested_category_id: null,
      })
    ).toBe(true);
  });

  it("keeps a one-off category without a matching suggestion as an exception", () => {
    expect(
      isImportExceptionRow({
        decision: "import",
        selected_category_id: "cat-1",
        suggested_category_id: null,
      })
    ).toBe(true);
  });

  it("treats a category correction as an exception", () => {
    expect(
      isImportExceptionRow({
        decision: "import",
        selected_category_id: "cat-2",
        suggested_category_id: "cat-1",
      })
    ).toBe(true);
  });

  it("hides clean categorized imports and folded duplicates", () => {
    expect(
      isImportExceptionRow({
        decision: "import",
        selected_category_id: "cat-1",
        suggested_category_id: "cat-1",
      })
    ).toBe(false);
    expect(
      isImportExceptionRow({
        decision: "duplicate",
        selected_category_id: null,
        suggested_category_id: null,
      })
    ).toBe(false);
  });
});

describe("summarizeImportReview", () => {
  it("counts ready, Inne, pending, and duplicate buckets", () => {
    expect(
      summarizeImportReview({
        importRows: [
          { selected_category_id: "cat-1" },
          { selected_category_id: "cat-1" },
          { selected_category_id: null },
        ],
        pendingCount: 1,
        duplicateCount: 4,
      })
    ).toEqual({ ready: 2, pending: 1, inne: 1, duplicates: 4 });
  });
});
