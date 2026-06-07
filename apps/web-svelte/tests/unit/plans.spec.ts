import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { derivePlanBucket } from "$lib/services/plans";
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
