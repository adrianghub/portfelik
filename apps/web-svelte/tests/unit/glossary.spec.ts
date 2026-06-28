import { describe, expect, it } from "vitest";
import { buildGlossaryEntries, glossaryEntryById, searchGlossary } from "$lib/content/glossary";

describe("glossary", () => {
  const entries = buildGlossaryEntries();

  it("includes the planned newcomer terms", () => {
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("import");
    expect(ids).toContain("majatek_netto");
    expect(ids).toContain("refinansowanie");
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });

  it("finds entries by id and search query", () => {
    const importEntry = glossaryEntryById("import", entries);
    expect(importEntry?.term.length).toBeGreaterThan(0);
    const results = searchGlossary("saldo", entries);
    expect(results.some((e) => e.id === "saldo" || e.id === "saldo_prognoza")).toBe(true);
  });
});
