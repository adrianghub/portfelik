import { describe, expect, it } from "vitest";
import {
  buildAttentionItems,
  type AttentionInput,
  type AttentionPlan,
} from "$lib/dashboard-attention";

const plan = (o: Partial<AttentionPlan> = {}): AttentionPlan => ({
  planId: "p1",
  planName: "Plan",
  kind: "spend",
  eligibleCount: 0,
  monthlyNeeded: null,
  monthlyActual: null,
  monthlyActualBasis: "none",
  ...o,
});

const base: AttentionInput = {
  daysSinceImport: 0,
  cadenceDays: 14,
  overdueCount: 0,
  plans: [],
};

describe("buildAttentionItems", () => {
  it("returns nothing when all signals are healthy", () => {
    expect(buildAttentionItems(base)).toEqual([]);
  });

  it("surfaces overdue transactions first as a warn item", () => {
    const items = buildAttentionItems({ ...base, overdueCount: 3 });
    expect(items[0].id).toBe("overdue");
    expect(items[0].tone).toBe("warn");
    expect(items[0].href).toBe("/transactions?status=overdue");
  });

  it("flags a never-run import distinctly from a stale one", () => {
    expect(buildAttentionItems({ ...base, daysSinceImport: null }).some((i) => i.id === "import")).toBe(
      true
    );
    expect(buildAttentionItems({ ...base, daysSinceImport: 5, cadenceDays: 14 }).some((i) => i.id === "import")).toBe(
      false
    );
    expect(buildAttentionItems({ ...base, daysSinceImport: 20, cadenceDays: 14 }).some((i) => i.id === "import")).toBe(
      true
    );
  });

  it("picks the spend plan with the most eligible settlements", () => {
    const items = buildAttentionItems({
      ...base,
      plans: [
        plan({ planId: "a", kind: "spend", eligibleCount: 2 }),
        plan({ planId: "b", kind: "spend", eligibleCount: 9 }),
      ],
    });
    const settle = items.find((i) => i.id.startsWith("settle-"));
    expect(settle?.href).toBe("/plans/b/settle");
  });

  it("counts a save plan off-track only when the current-month pace is short", () => {
    const offTrack = buildAttentionItems({
      ...base,
      plans: [
        plan({ planId: "s", kind: "save", monthlyNeeded: 1000, monthlyActual: 0, monthlyActualBasis: "none" }),
      ],
    });
    expect(offTrack.some((i) => i.id === "save-s")).toBe(true);

    const onPace = buildAttentionItems({
      ...base,
      plans: [
        plan({
          planId: "s",
          kind: "save",
          monthlyNeeded: 1000,
          monthlyActual: 1000,
          monthlyActualBasis: "current-month",
        }),
      ],
    });
    expect(onPace.some((i) => i.id === "save-s")).toBe(false);
  });

  it("caps the list at four items", () => {
    const items = buildAttentionItems({
      daysSinceImport: null,
      cadenceDays: 14,
      overdueCount: 2,
      plans: [
        plan({ planId: "a", kind: "spend", eligibleCount: 3 }),
        plan({ planId: "s", kind: "save", monthlyNeeded: 500, monthlyActual: 0, monthlyActualBasis: "none" }),
      ],
    });
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items.map((i) => i.id)).toEqual(["overdue", "import", "settle-a", "save-s"]);
  });
});
