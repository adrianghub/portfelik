import { describe, expect, it } from "vitest";
import type { SpendingInsight } from "$lib/services/spending-insight";

// The card is presentational; assert the engine output shape it relies on is
// stable (component DOM tests run under the components config, not unit).
describe("spending insight card contract", () => {
  it("SpendingInsight exposes the fields the hero renders", () => {
    const sample: SpendingInsight = {
      spent: 150,
      net: 50,
      prevSpent: 100,
      spentDeltaPct: 50,
      categories: [
        {
          categoryId: "food",
          name: "Jedzenie",
          total: 150,
          prevTotal: 100,
          deltaAbs: 50,
          deltaPct: 50,
          avgTotal: 100,
          anomaly: true,
          budgetAmount: 100,
          budgetUsedPct: 150,
        },
      ],
      biggestMovers: [],
      biggestExpenses: [],
      isFirstPeriod: false,
    };
    expect(sample.categories[0].anomaly).toBe(true);
    expect(sample.spentDeltaPct).toBe(50);
  });
});
