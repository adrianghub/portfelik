import { describe, expect, it } from "vitest";
import { buildForwardPeriodWindows, buildPeriodWindows } from "$lib/services/period-history";

const REF = new Date(2026, 5, 23); // 2026-06-23 (month index 5 = June)

describe("buildForwardPeriodWindows", () => {
  it("returns `count` month windows after the current month, oldest first", () => {
    const w = buildForwardPeriodWindows("month", 3, REF);
    expect(w).toHaveLength(3);
    expect(w[0].label).toBe("Lip"); // July
    expect(w[1].label).toBe("Sie"); // August
    expect(w[2].label).toBe("Wrz"); // September
    expect(new Date(w[0].start).getMonth()).toBe(6); // July = index 6
  });

  it("month windows do not overlap the current period from buildPeriodWindows", () => {
    const past = buildPeriodWindows("month", 6, REF);
    const fwd = buildForwardPeriodWindows("month", 3, REF);
    const currentStart = new Date(past[past.length - 1].start).getTime();
    expect(new Date(fwd[0].start).getTime()).toBeGreaterThan(currentStart);
  });

  it("returns year windows after the current year", () => {
    const w = buildForwardPeriodWindows("year", 3, REF);
    expect(w.map((x) => x.label)).toEqual(["2027", "2028", "2029"]);
  });

  it("returns 7-day week windows after the current trailing week", () => {
    const past = buildPeriodWindows("week", 1, REF); // current week
    const fwd = buildForwardPeriodWindows("week", 3, REF);
    expect(fwd).toHaveLength(3);
    // first forward week starts exactly where the current week ends
    expect(fwd[0].start).toBe(past[0].end);
    // contiguous 7-day spans
    expect(new Date(fwd[1].start).getTime()).toBe(new Date(fwd[0].end).getTime());
  });
});
