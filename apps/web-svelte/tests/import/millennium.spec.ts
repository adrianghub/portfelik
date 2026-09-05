import { describe, expect, it } from "vitest";
import { millenniumAdapter } from "$lib/import/banks/millennium";
import { detectImportAdapter } from "$lib/import/banks/registry";

const fixture = [
  '"Bank Millennium S.A."',
  '"Historia transakcji"',
  '"Data transakcji";"Opis transakcji";"Kontrahent";"Obciążenia";"Uznania";"Waluta"',
  '"01-09-2026";"Zakupy";"SKLEP";"-125,40";"";"pln"',
  '"02-09-2026";"Przelew";"PRACODAWCA";"";"9000,00";"PLN"',
].join("\r\n");

describe("Millennium adapter - provisional contract fixture", () => {
  it("does not claim a generic date/amount layout as Millennium", () => {
    const generic = '"Data transakcji";"Opis transakcji";"Kwota"\n"01.09.2026";"Test";"-10,00"';
    expect(detectImportAdapter(generic)).toBeNull();
  });

  it("finds a header after the bank preamble and asks for manual confirmation", () => {
    expect(detectImportAdapter(fixture)).toMatchObject({
      kind: "millennium",
      confidence: "medium",
    });
  });

  it("parses split debit/credit columns and preserves source rows", () => {
    const out = millenniumAdapter.parse(fixture);
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      posted_at: "2026-09-01",
      amount: 125.4,
      type: "expense",
      currency: "PLN",
      row_index: 0,
      source_row_text: '"01-09-2026";"Zakupy";"SKLEP";"-125,40";"";"pln"',
    });
    expect(out.rows[1]).toMatchObject({ amount: 9000, type: "income", row_index: 1 });
  });

  it("falls back to a signed amount when split columns are present but empty", () => {
    const mixed = [
      '"Data transakcji";"Opis";"Obciążenia";"Uznania";"Kwota"',
      '"03.09.2026";"Korekta";"";"";"-42,10"',
    ].join("\n");
    const out = millenniumAdapter.parse(mixed);
    expect(out.errors).toEqual([]);
    expect(out.rows[0]).toMatchObject({ amount: 42.1, type: "expense" });
  });

  it("fails once with a structural error when required columns are absent", () => {
    const out = millenniumAdapter.parse('"Bank Millennium"\n"foo";"bar"\n"1";"2"');
    expect(out.rows).toEqual([]);
    expect(out.errors).toEqual([{ row_index: -1, reason: "millennium_required_columns_missing" }]);
  });
});
