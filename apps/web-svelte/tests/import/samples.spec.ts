import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectImportAdapter, getImportAdapter } from "$lib/import/banks/registry";
import type { ImportAdapterKind } from "$lib/import/banks/types";

// Guards the committed sample-imports/ files used for manual import testing:
// each must auto-detect to the expected adapter and parse with zero errors so
// they stay valid as adapters evolve.
const samples: Array<{ file: string; kind: ImportAdapterKind }> = [
  { file: "mbank-2026.csv", kind: "mbank" },
  { file: "ing.csv", kind: "ing" },
  { file: "erste.csv", kind: "erste" },
];

describe("sample-imports fixtures", () => {
  for (const { file, kind } of samples) {
    const text = readFileSync(resolve(__dirname, "../../sample-imports", file), "utf-8");

    it(`${file} detects as ${kind}`, () => {
      expect(detectImportAdapter(text)?.kind).toBe(kind);
    });

    it(`${file} parses with rows and zero errors`, () => {
      const out = getImportAdapter(kind).parse(text);
      expect(out.errors).toEqual([]);
      expect(out.rows.length).toBeGreaterThan(0);
    });
  }
});
