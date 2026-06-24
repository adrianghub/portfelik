import { describe, expect, it } from "vitest";
import { suggestStatusForDate } from "$lib/services/transaction-cashflow";

describe("suggestStatusForDate", () => {
  const today = "2026-06-23";

  it("suggests 'upcoming' for a future date", () => {
    expect(suggestStatusForDate("2026-06-24", today)).toBe("upcoming");
    expect(suggestStatusForDate("2027-01-01", today)).toBe("upcoming");
  });

  it("suggests 'paid' for today", () => {
    expect(suggestStatusForDate("2026-06-23", today)).toBe("paid");
  });

  it("suggests 'paid' for a past date", () => {
    expect(suggestStatusForDate("2026-06-22", today)).toBe("paid");
    expect(suggestStatusForDate("2020-01-01", today)).toBe("paid");
  });
});
