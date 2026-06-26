import { describe, expect, it } from "vitest";
import {
  buildForwardPeriodWindows,
  buildPeriodWindows,
  bucketPeriodHistory,
} from "$lib/services/period-history";
import type { TransactionWithCategory } from "$lib/types";

// UTC-based ref so tests are timezone-independent.
const REF = new Date(Date.UTC(2026, 5, 23)); // 2026-06-23T00:00:00.000Z

describe("buildForwardPeriodWindows", () => {
  it("returns `count` month windows after the current month, oldest first", () => {
    const w = buildForwardPeriodWindows("month", 3, REF);
    expect(w).toHaveLength(3);
    expect(w[0].label).toBe("Lip"); // July
    expect(w[1].label).toBe("Sie"); // August
    expect(w[2].label).toBe("Wrz"); // September
    expect(new Date(w[0].start).getUTCMonth()).toBe(6); // July = index 6
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

describe("UTC-consistency of period window bounds", () => {
  it("month window .start values are UTC-midnight ISO strings", () => {
    const w = buildPeriodWindows("month", 6, REF);
    for (const win of w) {
      expect(win.start).toMatch(/T00:00:00\.000Z$/);
    }
    const fwd = buildForwardPeriodWindows("month", 3, REF);
    for (const win of fwd) {
      expect(win.start).toMatch(/T00:00:00\.000Z$/);
    }
  });

  it("year window .start values are UTC-midnight ISO strings", () => {
    const w = buildPeriodWindows("year", 3, REF);
    for (const win of w) {
      expect(win.start).toMatch(/T00:00:00\.000Z$/);
    }
    const fwd = buildForwardPeriodWindows("year", 3, REF);
    for (const win of fwd) {
      expect(win.start).toMatch(/T00:00:00\.000Z$/);
    }
  });

  it("a 2026-07-01 expense buckets into the July window, not June", () => {
    const past = buildPeriodWindows("month", 6, REF);
    const fwd = buildForwardPeriodWindows("month", 3, REF);
    const windows = [...past, ...fwd];
    const tx = {
      id: "t1",
      amount: 50,
      currency: "PLN",
      counterparty: null,
      description: "Test",
      date: "2026-07-01",
      type: "expense",
      status: "paid",
      category_id: "c1",
      user_id: "u1",
      is_recurring: false,
      recurring_day: null,
      recurrence_frequency: null,
      recurrence_interval: 0,
      recurrence_weekday: null,
      recurrence_month: null,
      recurring_template_id: null,
      recurring_occurrence_date: null,
      recurrence_end_date: null,
      group_id: null,
      created_at: "",
      updated_at: "",
      category_name: "Jedzenie",
      category_type: "expense",
      is_hold: false,
    } as TransactionWithCategory;
    const buckets = bucketPeriodHistory([tx], windows);
    const julyBucket = buckets.find((b) => b.label === "Lip");
    const juneBucket = buckets.find((b) => b.label === "Cze");
    expect(julyBucket?.total).toBe(50);
    expect(juneBucket?.total).toBe(0);
  });
});
