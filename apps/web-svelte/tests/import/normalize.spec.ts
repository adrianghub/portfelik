import { describe, expect, it } from "vitest";
import { mbankAdapter } from "$lib/import/banks/mbank";
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
});
