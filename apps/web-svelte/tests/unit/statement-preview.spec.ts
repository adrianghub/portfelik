import { describe, expect, it } from "vitest";
import { statementCounts, statementRows } from "$lib/import/statement-preview";
import type { ImportRow } from "$lib/services/bank-import";

describe("statement inbox", () => {
  it("requires a new category when a preview category has been archived", () => {
    const row = { decision: "import", selected_category_id: "old" } as ImportRow;
    const archived = new Set(["old"]);
    expect(statementCounts([row], archived).ready).toBe(0);
    expect(statementRows([row], "review", archived)).toEqual([row]);
  });
  it("counts every row once, including skips and duplicates without a category", () => {
    const rows = [
      { id: "ready", decision: "import", selected_category_id: "shopping" },
      { id: "uncategorized", decision: "import", selected_category_id: null },
      { id: "hold", decision: "pending", selected_category_id: "shopping" },
      { id: "skip", decision: "skip", selected_category_id: null },
      { id: "duplicate", decision: "duplicate", selected_category_id: null },
    ] as ImportRow[];
    const counts = statementCounts(rows);
    expect(counts).toEqual({ all: 5, ready: 1, review: 2, skipped: 1, duplicates: 1 });
    expect(statementRows(rows, "review").map((row) => row.id)).toEqual(["uncategorized", "hold"]);
    expect(statementRows(rows, "all")).toHaveLength(5);
  });
  it("removes a resolved exception without treating a one-off category as unfinished", () => {
    const row = {
      id: "a",
      decision: "import",
      selected_category_id: "new",
      suggested_category_id: "old",
    } as ImportRow;
    expect(statementRows([row], "review")).toEqual([]);
    expect(statementCounts([row]).ready).toBe(1);
  });
});
