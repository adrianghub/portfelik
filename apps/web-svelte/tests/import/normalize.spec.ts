import { describe, expect, it } from "vitest";
import { mbankAdapter } from "$lib/import/banks/mbank";
import type { ParsedImportFile, ParsedRow } from "$lib/import/banks/types";
import { normalize } from "$lib/import/normalize";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(__dirname, "fixtures/mbank/sample.csv");
const fixtureText = readFileSync(fixturePath, "utf-8");
const fixtureBytes = readFileSync(fixturePath).buffer;

describe("import/normalize", () => {
  it("attaches a 64-char hex raw_row_hash to every row", async () => {
    const parsed = mbankAdapter.parse(fixtureText);
    const normalized = await normalize(parsed, fixtureBytes);
    expect(normalized.rows).toHaveLength(parsed.rows.length);
    for (const r of normalized.rows) {
      expect(r.raw_row_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("returns a 64-char hex sourceFileHash", async () => {
    const parsed = mbankAdapter.parse(fixtureText);
    const normalized = await normalize(parsed, fixtureBytes);
    expect(normalized.sourceFileHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the same source bytes produce the same sourceFileHash (idempotent)", async () => {
    const parsed = mbankAdapter.parse(fixtureText);
    const a = await normalize(parsed, fixtureBytes);
    const b = await normalize(parsed, fixtureBytes);
    expect(a.sourceFileHash).toBe(b.sourceFileHash);
  });

  it("preserves source_row_text → raw_row_hash mapping (no shuffle)", async () => {
    const parsed = mbankAdapter.parse(fixtureText);
    const normalized = await normalize(parsed, fixtureBytes);
    expect(normalized.rows[0].source_row_text).toBe(parsed.rows[0].source_row_text);
    expect(normalized.rows.at(-1)!.source_row_text).toBe(parsed.rows.at(-1)!.source_row_text);
  });

  // The DB rejects amount <= 0 (transaction_import_rows_amount_check). A real
  // statement can carry a 0,00 hold/reversal line; a single one used to fail the
  // whole insertPreviewRows batch and strand a half-open session (Erste repro).
  it("drops non-positive amount rows into errors instead of emitting them", async () => {
    const mkRow = (row_index: number, amount: number): ParsedRow => ({
      posted_at: "2026-01-22",
      amount,
      type: "expense",
      description: "row",
      currency: "PLN",
      source_row_text: `row-${row_index}`,
      row_index,
    });
    const parsed: ParsedImportFile = {
      kind: "erste",
      rows: [mkRow(1, 4140), mkRow(2, 0), mkRow(3, 87.45)],
      errors: [],
    };
    const normalized = await normalize(parsed, new ArrayBuffer(8));

    expect(normalized.rows.map((r) => r.row_index)).toEqual([1, 3]);
    expect(normalized.errors).toContainEqual({ row_index: 2, reason: "non_positive_amount" });
    for (const r of normalized.rows) {
      expect(r.amount).toBeGreaterThan(0);
    }
  });
});
