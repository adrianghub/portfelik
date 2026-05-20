import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ingAdapter } from "$lib/import/banks/ing";
import { detectBank } from "$lib/import/banks/detect";

const fixture = readFileSync(
  resolve(__dirname, "fixtures/ing/sample.csv"),
  "utf-8"
);

describe("ing adapter — synthetic fixture", () => {
  it("detect() returns true for ING-shaped headers", () => {
    expect(detectBank(fixture)).toBe("ing");
  });

  it("parses 4 data rows, 0 errors", () => {
    const out = ingAdapter.parse(fixture);
    expect(out.kind).toBe("ing");
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(4);
  });

  it("extracts external_id (Nr transakcji) for hard dedup", () => {
    const out = ingAdapter.parse(fixture);
    const ids = out.rows.map((r) => r.external_id);
    expect(ids).toEqual(["EXT-001", "EXT-002", "EXT-003", "EXT-004"]);
  });

  it("suppresses Nr transakcji when it is a constant statement id", () => {
    const withConstantStatementId = [
      '"Data transakcji";"Dane kontrahenta";"Tytuł";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta"',
      '"2026-01-01";"SHOP A";"Zakup";"STATEMENT-001";"-10,00";"PLN"',
      '"2026-01-02";"SHOP B";"Zakup";"STATEMENT-001";"-20,00";"PLN"',
    ].join("\n");

    const out = ingAdapter.parse(withConstantStatementId);
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((row) => row.external_id)).toEqual([undefined, undefined]);
  });

  it("skips blank and footer rows after the transaction table", () => {
    const withFooterRows = [
      '"Data transakcji";"Dane kontrahenta";"Tytuł";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta"',
      '"2026-01-01";"SHOP A";"Zakup";"EXT-001";"-10,00";"PLN"',
      ';;;;;',
      '"Wygenerowano dnia";;;;;',
    ].join("\n");

    const out = ingAdapter.parse(withFooterRows);
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(1);
  });

  it("signed amount column: negative → expense, positive → income", () => {
    const out = ingAdapter.parse(fixture);
    const netflix = out.rows.find((r) => r.description.includes("SUBSKRYPCJA"))!;
    expect(netflix.type).toBe("expense");
    expect(netflix.amount).toBe(43);

    const salary = out.rows.find((r) => r.description.includes("WYPŁATA"))!;
    expect(salary.type).toBe("income");
    expect(salary.amount).toBe(8500);
  });

  it("captures counterparty when present", () => {
    const out = ingAdapter.parse(fixture);
    const uber = out.rows.find((r) => r.counterparty === "UBER POLSKA");
    expect(uber).toBeTruthy();
    expect(uber!.type).toBe("expense");
  });

  it("uses Waluta column for currency, defaulting to PLN", () => {
    const out = ingAdapter.parse(fixture);
    for (const r of out.rows) expect(r.currency).toBe("PLN");
  });

  it("falls back to debit/credit columns when signed Kwota missing", () => {
    const split = [
      '"Data transakcji";"Dane kontrahenta";"Tytuł";"Nr transakcji";"Kwota debetu";"Kwota kredytu";"Waluta"',
      '"2026-05-06";"FOO";"BAR";"EXT-099";"55,00";"";"PLN"',
      '"2026-05-07";"BAZ";"QUX";"EXT-100";"";"100,00";"PLN"',
    ].join("\n");
    const out = ingAdapter.parse(split);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].type).toBe("expense");
    expect(out.rows[0].amount).toBe(55);
    expect(out.rows[1].type).toBe("income");
    expect(out.rows[1].amount).toBe(100);
  });
});
