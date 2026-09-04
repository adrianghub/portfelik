import { describe, expect, it } from "vitest";
import { pkoBpAdapter } from "$lib/import/banks/pko_bp";
import { detectImportAdapter } from "$lib/import/banks/registry";

const fixture = [
  '"PKO BP - historia rachunku"',
  '"Data operacji";"Opis operacji";"Odbiorca";"Kwota operacji";"Waluta operacji"',
  '"01.09.2026";"Płatność kartą";"SKLEP; TEST";"-1 234,56";"pln"',
  '"02.09.2026";"Wynagrodzenie";"FIRMA";"8500,00";"PLN"',
].join("\n");

describe("PKO BP adapter - provisional contract fixture", () => {
  it("requires a brand signal before suggesting PKO for generic headers", () => {
    const generic = '"Data operacji";"Opis operacji";"Kwota"\n"01.09.2026";"Test";"-10,00"';
    expect(detectImportAdapter(generic)).toBeNull();
  });

  it("finds a header after the bank preamble and asks for manual confirmation", () => {
    expect(detectImportAdapter(fixture)).toMatchObject({
      kind: "pko_bp",
      confidence: "medium",
    });
  });

  it("parses signed amounts, currency and preserves the exact source row", () => {
    const out = pkoBpAdapter.parse(fixture);
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      posted_at: "2026-09-01",
      amount: 1234.56,
      type: "expense",
      counterparty: "SKLEP; TEST",
      currency: "PLN",
      row_index: 0,
      source_row_text: '"01.09.2026";"Płatność kartą";"SKLEP; TEST";"-1 234,56";"pln"',
    });
    expect(out.rows[1]).toMatchObject({ amount: 8500, type: "income", row_index: 1 });
  });

  it("fails once with a structural error when required columns are absent", () => {
    const out = pkoBpAdapter.parse('"PKO BP"\n"foo";"bar"\n"1";"2"');
    expect(out.rows).toEqual([]);
    expect(out.errors).toEqual([{ row_index: -1, reason: "pko_bp_required_columns_missing" }]);
  });
});
