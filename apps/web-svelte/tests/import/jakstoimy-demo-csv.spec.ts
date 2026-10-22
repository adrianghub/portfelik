import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ersteAdapter } from "../../src/lib/import/banks/erste";
import { detectImportAdapter } from "../../src/lib/import/banks/registry";

const csvPath = resolve(__dirname, "../../sample-imports/jakstoimy-demo.csv");
const manifestPath = resolve(__dirname, "../../sample-imports/jakstoimy-demo.manifest.json");

describe("jakstoimy-demo.csv fixture", () => {
  const text = readFileSync(csvPath, "utf8");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    row_count_transactions: number;
    income_grosze: number;
    expense_grosze: number;
    net_grosze: number;
    date_start: string;
    date_end: string;
    adapter: string;
  };

  it("is detected and parsed by the production Erste adapter", () => {
    expect(detectImportAdapter(text)?.kind).toBe("erste");
    expect(manifest.adapter).toBe("erste");
    const parsed = ersteAdapter.parse(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(manifest.row_count_transactions);
    expect(parsed.rows).toHaveLength(96);
  });

  it("matches manifest totals in grosze", () => {
    const parsed = ersteAdapter.parse(text);
    let income = 0;
    let expense = 0;
    for (const row of parsed.rows) {
      const grosze = Math.round(Math.abs(row.amount) * 100);
      if (row.type === "income") income += grosze;
      else expense += grosze;
    }
    expect(income).toBe(manifest.income_grosze);
    expect(expense).toBe(manifest.expense_grosze);
    expect(income - expense).toBe(manifest.net_grosze);
  });

  it("spans six months with past-only date bounds", () => {
    const parsed = ersteAdapter.parse(text);
    const dates = parsed.rows.map((r) => r.posted_at).sort();
    expect(dates[0]).toBe(manifest.date_start);
    expect(dates[dates.length - 1]).toBe(manifest.date_end);
    const months = new Set(dates.map((d) => d.slice(0, 7)));
    expect(months.size).toBe(6);

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(manifest.date_end < todayIso).toBe(true);
    expect(dates.every((d) => d < todayIso)).toBe(true);
  });
});
