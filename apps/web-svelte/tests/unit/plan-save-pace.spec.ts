import { describe, expect, it } from "vitest";
import {
  currentMonthSavePace,
  isSavePlanOffTrack,
  pickMostUrgentOffTrackSave,
  savePlanShortfall,
} from "$lib/services/plan-save-pace";

const save = (o: {
  monthlyNeeded: number | null;
  monthlyActual: number | null;
  monthlyActualBasis: string;
}) => ({
  kind: "save" as const,
  ...o,
});

describe("plan-save-pace", () => {
  it("counts only current-month deposits toward pace", () => {
    expect(
      currentMonthSavePace({ monthlyActual: 500, monthlyActualBasis: "historical-average" })
    ).toBe(0);
    expect(
      currentMonthSavePace({ monthlyActual: 500, monthlyActualBasis: "current-month" })
    ).toBe(500);
  });

  it("ranks off-track plans by absolute shortfall", () => {
    const picked = pickMostUrgentOffTrackSave([
      save({ monthlyNeeded: 1000, monthlyActual: 900, monthlyActualBasis: "current-month" }),
      save({ monthlyNeeded: 500, monthlyActual: 0, monthlyActualBasis: "current-month" }),
    ]);
    expect(savePlanShortfall(picked!)).toBe(500);
  });

  it("ignores on-pace save plans", () => {
    expect(
      isSavePlanOffTrack(
        save({ monthlyNeeded: 1000, monthlyActual: 1000, monthlyActualBasis: "current-month" })
      )
    ).toBe(false);
  });
});
