import { describe, expect, it } from "vitest";
import { getImportAdapter } from "$lib/import/banks/registry";
import type { ImportAdapterKind } from "$lib/import/banks/types";
import { inspectBankCsv } from "$lib/import/inspect";
import { normalize } from "$lib/import/normalize";

// Contract fixtures, not certified real exports. Deliberately distinct fields:
// preserve store numbers, dates, Polish characters and raw Unicode/whitespace.
const primary = "  Cafe\u0301\u00a0  0123 WARSZAWA 09.09.2026  ";
const counterparty = "  FIRMA\u00a0  ŻÓŁĆ 456  ";
const secondary = "  ID 9876  ";
const cases: { bank: ImportAdapterKind; csv: string; combined?: boolean }[] = [
  {
    bank: "mbank",
    combined: true,
    csv: `#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Kwota\n2026-09-09;"${primary}";"${secondary}";"${counterparty}";-12,34`,
  },
  {
    bank: "ing",
    combined: true,
    csv: `Data transakcji;Tytuł;Szczegóły;Dane kontrahenta;Kwota transakcji (waluta rachunku)\n2026-09-09;"${primary}";"${secondary}";"${counterparty}";-12,34`,
  },
  {
    bank: "pko_bp",
    csv: `Data operacji;Opis operacji;Odbiorca;Kwota\n09.09.2026;"${primary}";"${counterparty}";-12,34`,
  },
  {
    bank: "millennium",
    csv: `Data transakcji;Opis transakcji;Kontrahent;Kwota\n09.09.2026;"${primary}";"${counterparty}";-12,34`,
  },
  {
    bank: "erste",
    csv: `09-09-2026,09-09-2026,"${primary}","${counterparty}",PL001234,"-12,34","0,00",1,`,
  },
];
const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe("bank text contracts", () => {
  it.each(cases)(
    "$bank leaves a missing counterparty empty rather than guessing from the description",
    ({ bank, csv }) => {
      const row = getImportAdapter(bank).parse(csv.replace(counterparty, " \u00a0 ")).rows[0];
      expect(row.counterparty).toBeUndefined();
      expect(row.description).toContain("Café 0123 WARSZAWA");
    }
  );
  it.each(cases)(
    "$bank keeps independent bank columns and uses shared cleanup",
    async ({ bank, csv, combined }) => {
      const parsed = getImportAdapter(bank).parse(csv);
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows).toHaveLength(1);
      const row = parsed.rows[0];
      expect(row.description).toBe(`Café 0123 WARSZAWA 09.09.2026${combined ? " - ID 9876" : ""}`);
      expect(row.counterparty).toBe("FIRMA ŻÓŁĆ 456");
      expect(row.text_fields?.primary_description).toBe(primary);
      expect(row.text_fields?.counterparty).toBe(counterparty);
      if (combined) expect(row.text_fields?.secondary_description).toBe(secondary);
      const clean = await normalize(parsed, bytes(csv));
      expect(clean.rows[0].source_row_text).toBe(row.source_row_text);
      expect(clean.rows[0].text_fields).toEqual(row.text_fields);
    }
  );
  it.each(cases.slice(0, 2))("$bank ignores whitespace-only secondary columns", ({ bank, csv }) => {
    const row = getImportAdapter(bank).parse(csv.replace(secondary, " \u00a0 ")).rows[0];
    expect(row.description).toBe("Café 0123 WARSZAWA 09.09.2026");
  });
  it("PKO never substitutes a counterparty for a missing description", () => {
    const row = getImportAdapter("pko_bp").parse(
      "Data operacji;Odbiorca;Kwota\n09.09.2026;FIRMA;-12,34"
    ).rows[0];
    expect(row.description).toBe("Operacja bankowa");
    expect(row.counterparty).toBe("FIRMA");
    expect(row.text_fields?.primary_description).toBe("");
  });
  it("local inspector exposes raw columns and separate rule suggestions", async () => {
    const report = await inspectBankCsv(bytes(cases[0].csv), "mbank", 1);
    expect(report.rows_total).toBe(1);
    expect(report.rows[0].bank_fields?.primary_description).toBe(primary);
    expect(report.rows[0].normalized.description.normalized).toBe(
      "café 0123 warszawa 09.09.2026 - id 9876"
    );
    expect(report.rows[0].rule_suggestion).toEqual({
      description: "Café 0123 WARSZAWA 09.09.2026 - ID 9876",
      counterparty: "FIRMA ŻÓŁĆ 456",
    });
  });
  it("inspector requires explicit bank selection for an unrecognized layout", async () => {
    await expect(inspectBankCsv(bytes("unrecognized CSV"))).rejects.toThrow("unknown_bank");
    await expect(inspectBankCsv(bytes(cases[0].csv), "mbank", 0)).rejects.toThrow(
      "invalid_inspect_limit"
    );
  });
});
