import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  addCalendarMonths,
  calendarMonthsUntil,
  derivePlanBucket,
  savePlanDeadlineAnchor,
  savePlanSliderMonths,
  todayIso,
} from "$lib/services/plans";
import type { Plan } from "$lib/types";

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    name: "Wakacje",
    user_id: "user-1",
    group_id: null,
    category_id: null,
    kind: "spend",
    budget_amount: 3000,
    target_amount: null,
    start_date: "2026-07-01",
    end_date: "2026-07-14",
    created_at: "2026-06-01T08:00:00Z",
    updated_at: "2026-06-01T08:00:00Z",
    ...overrides,
  };
}

describe("derivePlanBucket", () => {
  it("puts future plans into upcoming", () => {
    expect(derivePlanBucket(plan({ start_date: "2026-07-01" }), "2026-06-28")).toBe("upcoming");
  });

  it("keeps plans active when today is inside the period", () => {
    expect(derivePlanBucket(plan(), "2026-07-08")).toBe("active");
  });

  it("treats the start and end dates as active days", () => {
    expect(derivePlanBucket(plan(), "2026-07-01")).toBe("active");
    expect(derivePlanBucket(plan(), "2026-07-14")).toBe("active");
  });

  it("puts plans finished before today into finished", () => {
    expect(derivePlanBucket(plan({ end_date: "2026-07-14" }), "2026-07-15")).toBe("finished");
  });
});

describe("calendar month helpers", () => {
  const anchor = "2026-06-08";

  it.each([3, 13, 14, 60])("round-trips %i months from anchor", (months) => {
    const end = addCalendarMonths(anchor, months);
    expect(calendarMonthsUntil(end, anchor)).toBe(months);
  });

  it("does not drift when sliding from 14 to 13 months", () => {
    const at14 = addCalendarMonths(todayIso(), 14);
    expect(calendarMonthsUntil(at14)).toBe(14);
    const at13 = addCalendarMonths(todayIso(), 13);
    expect(calendarMonthsUntil(at13)).toBe(13);
    expect(at13 < at14).toBe(true);
  });
});

describe("save plan deadline slider", () => {
  it("anchors upcoming goals at start_date", () => {
    const upcoming = plan({
      kind: "save",
      start_date: "2027-01-04",
      end_date: "2027-07-08",
      target_amount: 40_000,
    });
    expect(savePlanDeadlineAnchor(upcoming, "2026-06-08")).toBe("2027-01-04");
    expect(savePlanSliderMonths(upcoming, "2026-06-08")).toBe(6);
    expect(addCalendarMonths("2027-01-04", 3)).toBe("2027-04-04");
  });

  it("anchors active goals at today", () => {
    const active = plan({
      kind: "save",
      start_date: "2026-01-01",
      end_date: "2027-01-01",
      target_amount: 40_000,
    });
    expect(savePlanDeadlineAnchor(active, "2026-06-08")).toBe("2026-06-08");
    expect(savePlanSliderMonths(active, "2026-06-08")).toBe(6);
  });
});
