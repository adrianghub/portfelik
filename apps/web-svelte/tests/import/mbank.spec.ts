import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mbankAdapter } from "$lib/import/banks/mbank";
import { detectBank } from "$lib/import/banks/detect";

const fixture = readFileSync(
  resolve(__dirname, "fixtures/mbank/sample.csv"),
  "utf-8"
);

describe("mbank adapter - synthetic fixture", () => {
  it("detect() returns true for mBank-shaped headers", () => {
    expect(detectBank(fixture)).toBe("mbank");
  });

  it("parses all 4 data rows and 0 errors", () => {
    const out = mbankAdapter.parse(fixture);
    expect(out.kind).toBe("mbank");
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(4);
  });

  it("normalizes amounts: negative → expense, positive → income, sign stripped", () => {
    const out = mbankAdapter.parse(fixture);
    const biedronka = out.rows.find((r) => r.description.includes("BIEDRONKA"))!;
    expect(biedronka.type).toBe("expense");
    expect(biedronka.amount).toBe(42.3);

    const salary = out.rows.find((r) => r.description.includes("WYPŁATA"))!;
    expect(salary.type).toBe("income");
    expect(salary.amount).toBe(8500);
  });

  it("captures counterparty separately when present", () => {
    const out = mbankAdapter.parse(fixture);
    const zabka = out.rows.find((r) => r.description.includes("ŻABKA"))!;
    expect(zabka.counterparty).toBe("ŻABKA");
  });

  it("sets currency=PLN (mBank export omits the column)", () => {
    const out = mbankAdapter.parse(fixture);
    for (const r of out.rows) expect(r.currency).toBe("PLN");
  });

  it("sets posted_at to ISO yyyy-mm-dd", () => {
    const out = mbankAdapter.parse(fixture);
    for (const r of out.rows) expect(r.posted_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("preserves source_row_text for each row (for later raw_row_hash)", () => {
    const out = mbankAdapter.parse(fixture);
    for (const r of out.rows) expect(r.source_row_text).toBeTruthy();
  });

  it("returns an error row when required headers are missing", () => {
    const bad = "Foo;Bar\n1;2\n";
    const out = mbankAdapter.parse(bad);
    expect(out.rows).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].reason).toBe("mbank_header_not_found");
  });
});
