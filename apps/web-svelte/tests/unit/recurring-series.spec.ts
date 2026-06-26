import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { dayBefore } from "$lib/services/recurring-series";

describe("dayBefore", () => {
  it("returns the previous UTC day", () => {
    expect(dayBefore("2026-07-15")).toBe("2026-07-14");
  });
  it("crosses month boundaries", () => {
    expect(dayBefore("2026-08-01")).toBe("2026-07-31");
  });
  it("crosses year boundaries", () => {
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});
