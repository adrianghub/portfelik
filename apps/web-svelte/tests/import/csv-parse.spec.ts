import { describe, expect, it } from "vitest";
import { parseCsv, tokenizeRow } from "$lib/import/csv/parse";

describe("csv/parse - tokenizer", () => {
  it("splits on `;` when more semicolons than commas", () => {
    const csv = parseCsv("a;b;c\n1;2;3\n");
    expect(csv.separator).toBe(";");
    expect(csv.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("splits on `,` when more commas than semicolons", () => {
    const csv = parseCsv("a,b,c\n1,2,3\n");
    expect(csv.separator).toBe(",");
    expect(csv.rows[0]).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields containing the separator", () => {
    expect(tokenizeRow('"a;b";c', ";")).toEqual(["a;b", "c"]);
  });

  it("unescapes doubled double-quotes", () => {
    expect(tokenizeRow('"a""b";c', ";")).toEqual(['a"b', "c"]);
  });

  it("strips UTF-8 BOM from input", () => {
    const csv = parseCsv("﻿col1;col2\nv1;v2");
    expect(csv.rows[0]).toEqual(["col1", "col2"]);
  });

  it("preserves rowTexts as original lines", () => {
    const csv = parseCsv("a;b\n1;2\n3;4");
    expect(csv.rowTexts).toEqual(["a;b", "1;2", "3;4"]);
  });

  it("detects a comma table after a delimiter-free metadata preamble", () => {
    const csv = parseCsv(
      '"Bank export"\n"Date","Description","Amount"\n"2026-09-01","Test","10.00"'
    );
    expect(csv.separator).toBe(",");
    expect(csv.rows[1]).toEqual(["Date", "Description", "Amount"]);
  });

  it("ignores delimiter characters inside quoted fields during detection", () => {
    const csv = parseCsv(
      '"Metadata, with, commas"\n"Data";"Opis";"Kwota"\n"2026-09-01";"Sklep, Warszawa";"10,00"'
    );
    expect(csv.separator).toBe(";");
  });

  it("keeps a quoted multiline field in one logical record", () => {
    const csv = parseCsv(
      'date;description;amount\r\n2026-09-01;"first line\r\nsecond line";-10,00\r\n'
    );
    expect(csv.rows).toHaveLength(2);
    expect(csv.rows[1]).toEqual(["2026-09-01", "first line\r\nsecond line", "-10,00"]);
    expect(csv.rowTexts[1]).toBe('2026-09-01;"first line\r\nsecond line";-10,00');
  });

  it("handles escaped quotes inside a multiline field", () => {
    const csv = parseCsv('a,b\n1,"first ""quoted"" line\nsecond line"');
    expect(csv.rows[1]).toEqual(["1", 'first "quoted" line\nsecond line']);
  });

  it("skips empty lines in row tokens but keeps file structure", () => {
    const csv = parseCsv("a;b\n\n1;2");
    expect(csv.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
