import { describe, expect, it } from "vitest";
import {
  exceededCaps,
  normalizeCapAmount,
  pileWindow,
  spentInPile,
} from "$lib/services/pile-progress";

describe("pile progress", () => {
  it("counts only paid expenses inside this month", () => {
    const spent = spentInPile(
      [
        {
          category_id: "groceries",
          type: "expense",
          currency: "PLN",
          status: "paid",
          amount: 40,
          date: "2026-09-02",
        },
        {
          category_id: "groceries",
          type: "expense",
          currency: "PLN",
          status: "paid",
          amount: 10,
          date: "2026-08-31",
        },
        {
          category_id: "groceries",
          type: "expense",
          currency: "PLN",
          status: "upcoming",
          amount: 99,
          date: "2026-09-20",
        },
        {
          category_id: "other",
          type: "expense",
          currency: "PLN",
          status: "paid",
          amount: 5,
          date: "2026-09-03",
        },
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

  it("sums paid expenses in grosze without floating-point overflow at the limit", () => {
    const rows = [0.1, 0.2].map((amount) => ({
      category_id: "groceries",
      type: "expense",
      currency: "PLN",
      status: "paid",
      amount,
      date: "2026-09-02",
    }));
    expect(spentInPile(rows, "groceries", "month", "2026-09-27")).toBe(0.3);
    expect(
      exceededCaps(
        [
          {
            id: "groceries",
            name: "Jedzenie",
            type: "expense",
            cap_amount: 0.3,
            cap_period: "month",
          },
        ],
        rows,
        "2026-09-27"
      )
    ).toEqual([]);
  });

  it("keeps spending inside the selected dashboard scope", () => {
    const rows = [
      {
        category_id: "groceries",
        type: "expense",
        currency: "PLN",
        status: "paid",
        amount: 40,
        date: "2026-09-02",
        group_id: null,
      },
      {
        category_id: "groceries",
        type: "expense",
        currency: "PLN",
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

  it("lists a category only when paid spending in scope is over the cap", () => {
    const categories = [
      {
        id: "groceries",
        name: "Jedzenie",
        type: "expense",
        cap_amount: 40,
        cap_period: "month" as const,
      },
      {
        id: "rent",
        name: "Czynsz",
        type: "expense",
        cap_amount: 100,
        cap_period: "month" as const,
      },
    ];
    const rows = [
      {
        category_id: "groceries",
        type: "expense",
        currency: "PLN",
        status: "paid",
        amount: 40,
        date: "2026-09-02",
        group_id: null,
      },
      {
        category_id: "groceries",
        type: "expense",
        currency: "PLN",
        status: "paid",
        amount: 15,
        date: "2026-09-03",
        group_id: "home",
      },
      {
        category_id: "groceries",
        type: "expense",
        currency: "PLN",
        status: "paid",
        amount: 99,
        date: "2026-08-31",
        group_id: null,
      },
    ];

    expect(exceededCaps(categories, rows, "2026-09-27", "own")).toEqual([]);
    expect(exceededCaps(categories, rows, "2026-09-27", "all")).toEqual([
      {
        categoryId: "groceries",
        name: "Jedzenie",
        spent: 55,
        cap: 40,
        period: "month",
      },
    ]);
  });

  it("keeps foreign-currency history out of PLN limits and exceeded-limit alerts", () => {
    const rows = [
      {
        category_id: "groceries",
        type: "expense",
        status: "paid",
        amount: 25,
        currency: "PLN",
        date: "2026-09-02",
      },
      {
        category_id: "groceries",
        type: "expense",
        status: "paid",
        amount: 100,
        currency: "EUR",
        date: "2026-09-02",
      },
      {
        category_id: "groceries",
        type: "expense",
        status: "paid",
        amount: 100,
        currency: "USD",
        date: "2026-09-02",
      },
    ];
    expect(spentInPile(rows, "groceries", "month", "2026-09-27")).toBe(25);
    expect(
      exceededCaps(
        [
          {
            id: "groceries",
            name: "Jedzenie",
            type: "expense",
            cap_amount: 50,
            cap_period: "month",
          },
        ],
        rows,
        "2026-09-27"
      )
    ).toEqual([]);
  });

  it("reads a number input without calling trim on it", () => {
    expect(normalizeCapAmount(120)).toBe(120);
    expect(normalizeCapAmount(0)).toBeNull();
    expect(normalizeCapAmount(undefined)).toBeNull();
    expect(normalizeCapAmount(null)).toBeNull();
    expect(normalizeCapAmount("  80 ")).toBe(80);
    expect(normalizeCapAmount("2 000,50")).toBe(2000.5);
    expect(normalizeCapAmount("")).toBeNull();
  });
});
