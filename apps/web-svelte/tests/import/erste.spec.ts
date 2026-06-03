import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ersteAdapter } from "../../src/lib/import/banks/erste";
import { normalize } from "../../src/lib/import/normalize";

const text = readFileSync(
  fileURLToPath(new URL("./fixtures/erste/historia.csv", import.meta.url)),
  "utf8"
);

describe("erste adapter", () => {
  it("parses the 4 transaction rows and skips the summary row", () => {
    const out = ersteAdapter.parse(text);
    expect(out.kind).toBe("erste");
    expect(out.errors).toHaveLength(0);
    expect(out.rows).toHaveLength(4);
  });

  it("keeps physical CSV row_index (summary row position included)", () => {
    const out = ersteAdapter.parse(text);
    // Summary row is physical index 0; first transaction sits at index 1.
    expect(out.rows.map((r) => r.row_index)).toEqual([1, 2, 3, 4]);
  });

  it("maps signed comma amounts and dd-mm-yyyy dates", () => {
    const first = ersteAdapter.parse(text).rows[0];
    expect(first).toMatchObject({
      posted_at: "2026-01-26",
      amount: 4140,
      type: "expense",
      currency: "PLN",
      counterparty: "Urzad Skarbowy",
    });
  });

  it("classifies an incoming transfer as income", () => {
    const income = ersteAdapter.parse(text).rows.find((r) => r.type === "income");
    expect(income).toMatchObject({ amount: 8200, type: "income" });
  });

  it("never surfaces Lp as external_id", () => {
    const out = ersteAdapter.parse(text);
    expect(out.rows.every((r) => r.external_id === undefined)).toBe(true);
  });

  it("detects the headerless layout at medium confidence", () => {
    const result = ersteAdapter.detect({ text, rows: [] });
    expect(result).toMatchObject({ kind: "erste", confidence: "medium" });
  });

  it("does not detect a 3-column generic CSV", () => {
    expect(ersteAdapter.detect({ text: "a,b,c\n1,2,3\n", rows: [] })).toBeNull();
  });

  it("detects a summary-less export at medium confidence", () => {
    const noSummary = [
      "26-01-2026,26-01-2026,Przelew,Urzad Skarbowy,11 1010 0000 0000 0000 0000 0001,\"-4140,00\",\"0,00\",1,",
      "24-01-2026,24-01-2026,Platnosc karta LIDL,LIDL SP Z OO,22 1020 0000 0000 0000 0000 0002,\"-87,45\",\"0,00\",2,",
    ].join("\n");
    expect(ersteAdapter.detect({ text: noSummary, rows: [] })).toMatchObject({
      kind: "erste",
      confidence: "medium",
    });
  });

  it("does not detect a semicolon-delimited (mBank-style) file", () => {
    const semi = "#Data operacji;#Opis operacji;#Kwota;\n26-01-2026;Foo;-10,00;\n";
    expect(ersteAdapter.detect({ text: semi, rows: [] })).toBeNull();
  });

  it("reports a ParseError for a row with an invalid amount", () => {
    const bad = '01-02-2026,01-02-2026,Bad row,Counterparty,11 1010 0000 0000 0000 0000 0001,NOT_AMOUNT,"0,00",1,';
    const out = ersteAdapter.parse(bad);
    expect(out.rows).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].reason).toBe("erste_invalid_amount");
  });

  // Real statements carry 0,00 hold/reversal lines. parse() emits them as
  // amount 0; the DB rejects amount <= 0, so a single such row used to fail the
  // whole insertPreviewRows batch and strand a half-open session. normalize()
  // must drop it (→ errors) so the valid rows still import.
  it("normalize() drops a 0,00 transaction row instead of stranding the import", async () => {
    const withZeroRow = [
      '26-01-2026,26-01-2026,Blokada autoryzacyjna,SKLEP,11 1010 0000 0000 0000 0000 0001,"0,00","0,00",1,',
      '24-01-2026,24-01-2026,Platnosc karta,LIDL,22 1020 0000 0000 0000 0000 0002,"-87,45","0,00",2,',
      '23-01-2026,23-01-2026,Wynagrodzenie,FIRMA,33 1030 0000 0000 0000 0000 0003,"8200,00","8200,00",3,',
    ].join("\n");
    const parsed = ersteAdapter.parse(withZeroRow);
    expect(parsed.rows.some((r) => r.amount === 0)).toBe(true); // parse still emits the 0 row

    const normalized = await normalize(parsed, new ArrayBuffer(8));
    expect(normalized.rows.every((r) => r.amount > 0)).toBe(true); // normalize cleans it
    expect(normalized.rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([87.45, 8200]);
    expect(normalized.errors.some((e) => e.reason === "non_positive_amount")).toBe(true);
  });
});
