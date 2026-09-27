import { describe, expect, it } from "vitest";
import { pileWindow, spentInPile } from "$lib/services/pile-progress";

describe("pile progress", () => {
  it("counts only paid expenses inside this month", () => {
    const spent = spentInPile(
      [
        { category_id: "groceries", type: "expense", status: "paid", amount: 40, date: "2026-09-02" },
        { category_id: "groceries", type: "expense", status: "paid", amount: 10, date: "2026-08-31" },
        { category_id: "groceries", type: "expense", status: "upcoming", amount: 99, date: "2026-09-20" },
        { category_id: "other", type: "expense", status: "paid", amount: 5, date: "2026-09-03" },
      ],
      "groceries",
      "month",
      "2026-09-27"
    );
    expect(spent).toBe(40);
    expect(pileWindow("month", "2026-09-27")).toEqual({
      start: "2026-09-01",
      end: "2026-10-01",
    });
  });

  it("uses the calendar year for a longer pile", () => {
    expect(pileWindow("year", "2026-09-27")).toEqual({
      start: "2026-01-01",
      end: "2027-01-01",
    });
  });
});
