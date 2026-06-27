import { describe, expect, it } from "vitest";
import type { CategoryInsight } from "$lib/services/spending-insight";
import {
  categorySharePct,
  categoryRingSegments,
  formatDeltaPct,
  isSignificantDeltaPct,
  topSpendingCategories,
  topSpendingMovers,
  TOP_SPENDING_CATEGORIES,
  TOP_SPENDING_MOVERS,
} from "$lib/services/spending-category-display";

function cat(id: string, total: number, deltaAbs = 0): CategoryInsight {
  return {
    categoryId: id,
    name: id,
    total,
    prevTotal: total - deltaAbs,
    deltaAbs,
    deltaPct: deltaAbs === 0 ? null : 50,
    avgTotal: total,
    anomaly: false,
    budgetAmount: null,
    budgetUsedPct: null,
  };
}

describe("spending-category-display", () => {
  it("categorySharePct returns 0 when spent is zero", () => {
    expect(categorySharePct(100, 0)).toBe(0);
  });

  it("categorySharePct rounds percentage of spent", () => {
    expect(categorySharePct(250, 1000)).toBe(25);
  });

  it("formatDeltaPct renders arrow and rounded magnitude", () => {
    expect(formatDeltaPct(12.4)).toBe("↑12%");
    expect(formatDeltaPct(-7.6)).toBe("↓8%");
    expect(formatDeltaPct(null)).toBe("");
  });

  it("isSignificantDeltaPct hides null and zero deltas", () => {
    expect(isSignificantDeltaPct(null)).toBe(false);
    expect(isSignificantDeltaPct(0)).toBe(false);
    expect(isSignificantDeltaPct(0.4)).toBe(false);
    expect(isSignificantDeltaPct(-0.6)).toBe(true);
    expect(isSignificantDeltaPct(2)).toBe(true);
  });

  it("topSpendingCategories keeps positive totals only and caps at N", () => {
    const categories = [
      cat("a", 500),
      cat("b", 0),
      cat("c", 300),
      cat("d", 200),
      cat("e", 100),
      cat("f", 50),
      cat("g", 25),
      cat("h", 10),
    ];
    const top = topSpendingCategories(categories, TOP_SPENDING_CATEGORIES);
    expect(top.map((c) => c.categoryId)).toEqual(["a", "c", "d", "e", "f", "g"]);
  });

  it("topSpendingMovers skips zero deltas and caps at N", () => {
    const movers = [cat("a", 100, 50), cat("b", 80, 0), cat("c", 60, -30), cat("d", 40, 10)];
    const top = topSpendingMovers(movers, TOP_SPENDING_MOVERS);
    expect(top.map((c) => c.categoryId)).toEqual(["a", "c", "d"]);
  });

  it("categoryRingSegments maps top categories to arc lengths", () => {
    const categories = [cat("a", 230), cat("b", 43), cat("c", 19.5)];
    const circumference = 100;
    const segments = categoryRingSegments(categories, 292.5, circumference, 4);
    expect(segments).toHaveLength(3);
    expect(segments[0].key).toBe("a");
    expect(Math.round(segments[0].arcLen)).toBe(Math.round((230 / 292.5) * 100));
    expect(segments.reduce((sum, s) => sum + s.arcLen, 0)).toBeCloseTo(circumference, 5);
  });
});
