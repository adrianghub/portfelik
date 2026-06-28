// tests/unit/filter-import-rows.spec.ts
import { describe, it, expect } from "vitest";
import { filterImportRows, type ImportRowFilter } from "$lib/import/filter-rows";

type Row = {
  id: string;
  description: string;
  counterparty: string | null;
  amount: number;
  selected_category_id: string | null;
};
const rows: Row[] = [
  {
    id: "1",
    description: "Żabka Gdańsk",
    counterparty: "Zabka",
    amount: 12.5,
    selected_category_id: "c1",
  },
  {
    id: "2",
    description: "Biedronka",
    counterparty: null,
    amount: 240,
    selected_category_id: null,
  },
  {
    id: "3",
    description: "Netflix",
    counterparty: "NETFLIX",
    amount: 43,
    selected_category_id: "c2",
  },
];

const empty: ImportRowFilter = { text: "", amountMin: null, amountMax: null, categoryId: null };

describe("filterImportRows", () => {
  it("returns all rows when filter empty", () => {
    expect(filterImportRows(rows, empty).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
  it("text matches description OR counterparty, case-insensitive", () => {
    expect(filterImportRows(rows, { ...empty, text: "netflix" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterImportRows(rows, { ...empty, text: "zab" }).map((r) => r.id)).toEqual(["1"]);
  });
  it("amount range is inclusive, open bounds allowed", () => {
    expect(
      filterImportRows(rows, { ...empty, amountMin: 40, amountMax: null }).map((r) => r.id)
    ).toEqual(["2", "3"]);
    expect(
      filterImportRows(rows, { ...empty, amountMin: null, amountMax: 50 }).map((r) => r.id)
    ).toEqual(["1", "3"]);
  });
  it("category filter matches selected_category_id", () => {
    expect(filterImportRows(rows, { ...empty, categoryId: "c1" }).map((r) => r.id)).toEqual(["1"]);
  });
  it("AND-combines all facets", () => {
    expect(
      filterImportRows(rows, { text: "e", amountMin: 40, amountMax: null, categoryId: "c2" }).map(
        (r) => r.id
      )
    ).toEqual(["3"]);
  });
});
