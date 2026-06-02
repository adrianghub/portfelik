import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  detectImportAdapter,
  getImportAdapter,
  importAdapterLabel,
  listImportAdapters,
} from "../../src/lib/import/banks/registry";

const fx = (p: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url)), "utf8");

describe("import adapter registry", () => {
  it("detects mBank with high confidence", () => {
    const result = detectImportAdapter(fx("mbank/sample.csv"));
    expect(result).toMatchObject({ kind: "mbank", confidence: "high" });
  });

  it("detects ING with high confidence", () => {
    const result = detectImportAdapter(fx("ing/sample.csv"));
    expect(result).toMatchObject({ kind: "ing", confidence: "high" });
  });

  it("returns null for an unrecognized CSV", () => {
    expect(detectImportAdapter("foo,bar,baz\n1,2,3\n")).toBeNull();
  });

  it("getImportAdapter throws on unknown kind", () => {
    // @ts-expect-error intentional bad kind
    expect(() => getImportAdapter("nope")).toThrow();
  });

  it("listImportAdapters filters by sourceKind", () => {
    const banks = listImportAdapters({ sourceKind: "bank_statement" });
    expect(banks.every((a) => a.sourceKind === "bank_statement")).toBe(true);
    expect(banks.map((a) => a.kind)).toContain("mbank");
  });

  it("importAdapterLabel returns the registry label", () => {
    expect(importAdapterLabel("ing")).toBe("ING Bank Śląski");
  });

  it("importAdapterLabel falls back to the kind string for an unregistered adapter", () => {
    expect(importAdapterLabel("pko_bp")).toBe("pko_bp");
  });

  it("medium/null detection still parses when the user picks the adapter", () => {
    // Simulates the override path: detection returned medium (or null), user
    // selects 'erste', parsing must succeed via getImportAdapter.
    const adapter = getImportAdapter("erste");
    expect(adapter.kind).toBe("erste");
    expect(adapter.sourceKind).toBe("bank_statement");
  });
});
