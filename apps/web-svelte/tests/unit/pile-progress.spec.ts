import { describe, expect, it } from "vitest";
import { normalizeCapAmount, pileWindow, spentInPile } from "$lib/services/pile-progress";

describe("pile progress", () => {
  it("counts only paid expenses inside this month", () => {
    const spent = spentInPile(
      [
        {
          category_id: "groceries",
          type: "expense",
          status: "paid",
          amount: 40,
          date: "2026-09-02",
        },
        {
          category_id: "groceries",
          type: "expense",
          status: "paid",
          amount: 10,
          date: "2026-08-31",
        },
        {
          category_id: "groceries",
          type: "expense",
          status: "upcoming",
          amount: 99,
          date: "2026-09-20",
        },
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

  it("keeps spending inside the selected dashboard scope", () => {
    const rows = [
      {
        category_id: "groceries",
        type: "expense",
        status: "paid",
        amount: 40,
        date: "2026-09-02",
        group_id: null,
      },
      {
        category_id: "groceries",
        type: "expense",
        status: "paid",
        amount: 15,
        date: "2026-09-03",
        group_id: "home",
      },
    ];
    expect(spentInPile(rows, "groceries", "month", "2026-09-27", "own")).toBe(40);
    expect(spentInPile(rows, "groceries", "month", "2026-09-27", "home")).toBe(15);
    expect(spentInPile(rows, "groceries", "month", "2026-09-27", "all")).toBe(55);
  });

  it("reads a number input without calling trim on it", () => {
    expect(normalizeCapAmount(120)).toBe(120);
    expect(normalizeCapAmount(0)).toBeNull();
    expect(normalizeCapAmount(undefined)).toBeNull();
    expect(normalizeCapAmount(null)).toBeNull();
    expect(normalizeCapAmount("  80 ")).toBe(80);
    expect(normalizeCapAmount("")).toBeNull();
  });
});
