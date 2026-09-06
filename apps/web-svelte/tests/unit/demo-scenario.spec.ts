import { describe, expect, it } from "vitest";
import { buildDemoTransactionSeeds } from "$lib/services/demo-scenario";

describe("demo scenario", () => {
  it("keeps paid current-month rows on or before today", () => {
    const now = new Date(2026, 8, 6, 12);
    const rows = buildDemoTransactionSeeds(now);
    const currentPaid = rows.filter(
      (row) => row.status !== "upcoming" && row.date.startsWith("2026-09")
    );

    expect(currentPaid.length).toBeGreaterThan(4);
    expect(currentPaid.every((row) => row.date <= "2026-09-06")).toBe(true);
    expect(currentPaid.some((row) => row.type === "income")).toBe(true);
    expect(currentPaid.some((row) => row.category === "goals")).toBe(true);
  });

  it("builds complete calendar history and a future queue across month end", () => {
    const rows = buildDemoTransactionSeeds(new Date(2026, 0, 30, 12));
    const historyMonths = new Set(
      rows.filter((row) => row.date < "2026-01-01").map((row) => row.date.slice(0, 7))
    );
    const upcoming = rows.filter((row) => row.status === "upcoming");

    expect(historyMonths).toEqual(new Set(["2025-10", "2025-11", "2025-12"]));
    expect(upcoming.every((row) => row.date > "2026-01-30")).toBe(true);
    expect(upcoming.some((row) => row.date.startsWith("2026-02"))).toBe(true);
  });
});
