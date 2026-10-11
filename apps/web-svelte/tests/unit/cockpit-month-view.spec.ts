import { describe, expect, it } from "vitest";
import { buildCockpitMonthView, type CockpitMonthRow } from "$lib/cockpit/month-view";
import {
  calendarMonthBounds,
  calendarMonthLabel,
  cashMonthQueryValue,
  cockpitMonthFetchBounds,
  ledgerRangeCoversMonth,
  parseCashMonthParam,
  shiftCalendarMonth,
  shortDayMonth,
} from "$lib/cockpit/month-window";
import { buildListViewUrl } from "$lib/utils/list-view-url";

const today = "2026-10-11";
const october = { year: 2026, month: 10 };
const anchor = { opening_amount: 12_000, as_of_date: "2026-01-01" };

function row(overrides: Partial<CockpitMonthRow> = {}): CockpitMonthRow {
  return {
    id: "tx-deposit",
    type: "expense",
    amount: 1_000,
    status: "paid",
    date: "2026-10-02",
    currency: "PLN",
    groupId: null,
    categoryId: null,
    ...overrides,
  };
}

function view(overrides: Partial<Parameters<typeof buildCockpitMonthView>[0]> = {}) {
  return buildCockpitMonthView({
    scopeFilter: "own",
    month: october,
    today,
    privateAnchor: anchor,
    rows: [
      row(),
      row({
        id: "tx-insurance",
        amount: 800,
        status: "upcoming",
        date: "2026-10-20",
      }),
    ],
    items: [
      {
        id: "item-apartment",
        amount: 4_000,
        dueDate: "2026-10-22",
        status: "confirmed",
        groupId: null,
      },
    ],
    links: [
      {
        planItemId: "item-apartment",
        transactionId: "tx-deposit",
        amount: 1_000,
        countsAsPaid: true,
      },
    ],
    ...overrides,
  });
}

describe("calendar month window", () => {
  it("uses inclusive month bounds, including a leap day", () => {
    expect(calendarMonthBounds(october)).toEqual({
      monthStart: "2026-10-01",
      monthEnd: "2026-10-31",
    });
    expect(calendarMonthBounds({ year: 2024, month: 2 })).toEqual({
      monthStart: "2024-02-01",
      monthEnd: "2024-02-29",
    });
    expect(calendarMonthBounds({ year: 2026, month: 2 }).monthEnd).toBe("2026-02-28");
  });

  it("covers a month only when the fetch includes the day after it ends", () => {
    const { monthStart, monthEnd } = calendarMonthBounds(october);
    const bounds = cockpitMonthFetchBounds(october);
    expect(bounds).toEqual({ start: "2026-10-01", endExclusive: "2026-11-01" });
    expect(cockpitMonthFetchBounds({ year: 2024, month: 2 }).endExclusive).toBe("2024-03-01");
    expect(ledgerRangeCoversMonth(bounds.start, bounds.endExclusive, monthStart, monthEnd)).toBe(
      true
    );
    expect(ledgerRangeCoversMonth(monthStart, "2026-10-15", monthStart, monthEnd)).toBe(false);
    expect(ledgerRangeCoversMonth("2026-10-02", bounds.endExclusive, monthStart, monthEnd)).toBe(
      false
    );
    expect(ledgerRangeCoversMonth(monthStart, monthEnd, monthStart, monthEnd)).toBe(false);
    expect(shortDayMonth("2026-06-15")).toBe("15.06");
    expect(shortDayMonth("2026-06-05")).toBe("5.06");
  });

  it("shifts across the year boundary and labels the month in Polish", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftCalendarMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(calendarMonthLabel(october)).toBe("Październik 2026");
  });

  it("keeps the current month out of the URL and ignores the period chip", () => {
    expect(parseCashMonthParam(null, today)).toEqual(october);
    expect(parseCashMonthParam("2026-13", today)).toEqual(october);
    expect(parseCashMonthParam("2026-09", today)).toEqual({ year: 2026, month: 9 });
    expect(cashMonthQueryValue(october, today)).toBeNull();
    expect(cashMonthQueryValue({ year: 2026, month: 9 }, today)).toBe("2026-09");
    expect(
      buildListViewUrl("/dashboard", new URLSearchParams("cashMonth=2026-09"), { period: "week" })
    ).toBe("/dashboard?cashMonth=2026-09&period=week");
  });
});

describe("cockpit month view", () => {
  it("counts a partial payment once and keeps an unlinked upcoming expense", () => {
    const result = view();
    expect(result.balance).toBe(11_000);
    expect(result.expenses).toBe(4_800);
    expect(result.forecast).toBe(7_200);
  });

  it("does not count the same ledger row twice", () => {
    const insurance = row({
      id: "tx-insurance",
      amount: 800,
      status: "upcoming",
      date: "2026-10-20",
    });
    const result = view({ rows: [row(), insurance, insurance] });
    expect(result.expenses).toBe(4_800);
  });

  it("keeps a goal allocation in the balance and out of expenses", () => {
    const result = view({
      rows: [row({ id: "tx-goal", amount: 250, categoryId: "cele" })],
      items: [],
      links: [],
      celeCategoryId: "cele",
    });
    expect(result.balance).toBe(11_750);
    expect(result.expenses).toBe(0);
  });

  it("does not reuse the private anchor for Wszystkie or Dom", () => {
    const shared = view({
      scopeFilter: "group-dom",
      rows: [row({ id: "tx-dom", amount: 400, groupId: "group-dom", status: "upcoming" })],
      items: [],
      links: [],
    });
    const all = view({ scopeFilter: "all", items: [], links: [] });
    expect(shared.balance).toBeNull();
    expect(shared.forecast).toBeNull();
    expect(shared.expenses).toBeNull();
    expect(shared.expensesFrom).toBeNull();
    expect(all.balance).toBeNull();
    expect(all.forecast).toBeNull();
    expect(all.expenses).toBe(1_800);
    expect(all.expensesFrom).toBeNull();
  });

  it("withholds household expenses while plan remainders and recurring rows are missing", () => {
    const result = view({
      scopeFilter: "group-dom",
      privateAnchor: null,
      rows: [row({ id: "tx-dom", amount: 400, groupId: "group-dom", status: "paid" })],
      items: [
        {
          id: "item-dom",
          amount: 4_000,
          dueDate: "2026-10-22",
          status: "confirmed",
          groupId: "group-dom",
        },
      ],
      links: [],
    });
    expect(result.balance).toBeNull();
    expect(result.forecast).toBeNull();
    expect(result.expenses).toBeNull();
    expect(result.expensesFrom).toBeNull();
  });

  it("withholds expenses when the month ledger does not cover the whole month", () => {
    const result = view({ monthLedger: "partial" });
    expect(result.balance).toBe(11_000);
    expect(result.expenses).toBeNull();
    expect(result.expensesFrom).toBeNull();
    expect(result.forecast).toBe(7_200);
  });

  it("returns no amounts for a month that ends before the anchor", () => {
    const result = view({
      month: { year: 2026, month: 5 },
      privateAnchor: { opening_amount: 12_000, as_of_date: "2026-06-01" },
      rows: [row({ id: "tx-may", amount: 300, date: "2026-05-10" })],
      items: [],
      links: [],
    });
    expect(result.balance).toBeNull();
    expect(result.expenses).toBeNull();
    expect(result.expensesFrom).toBeNull();
    expect(result.forecast).toBeNull();
  });

  it("counts only the part of a past month that is on or after the anchor", () => {
    const result = view({
      month: { year: 2026, month: 6 },
      privateAnchor: { opening_amount: 12_000, as_of_date: "2026-06-15" },
      rows: [
        row({ id: "tx-before", amount: 300, date: "2026-06-10" }),
        row({ id: "tx-after", amount: 500, date: "2026-06-20" }),
        row({ id: "tx-income", type: "income", amount: 200, date: "2026-06-18" }),
      ],
      items: [],
      links: [],
    });
    expect(result.balance).toBeNull();
    expect(result.expenses).toBe(500);
    expect(result.expensesFrom).toBe("2026-06-15");
    expect(result.forecast).toBe(11_700);
  });

  it("marks a zero when the only expenses are before an anchor inside the month", () => {
    const result = view({
      month: { year: 2026, month: 6 },
      privateAnchor: { opening_amount: 12_000, as_of_date: "2026-06-15" },
      rows: [row({ id: "tx-before", amount: 300, date: "2026-06-10" })],
      items: [],
      links: [],
    });
    expect(result.expenses).toBe(0);
    expect(result.expensesFrom).toBe("2026-06-15");
  });

  it("uses the opening amount when a past month starts on the anchor date", () => {
    const result = view({
      month: { year: 2026, month: 9 },
      privateAnchor: { opening_amount: 12_000, as_of_date: "2026-09-01" },
      rows: [row({ id: "tx-september", amount: 400, date: "2026-09-10" })],
      items: [],
      links: [],
    });
    expect(result.balance).toBe(12_000);
    expect(result.expenses).toBe(400);
    expect(result.expensesFrom).toBeNull();
    expect(result.forecast).toBe(11_600);
  });

  it("uses the opening amount when a future month starts on the anchor date", () => {
    const result = view({
      month: { year: 2026, month: 11 },
      privateAnchor: { opening_amount: 9_000, as_of_date: "2026-11-01" },
      rows: [row({ id: "tx-november", amount: 100, status: "upcoming", date: "2026-11-02" })],
      items: [],
      links: [],
    });
    expect(result.balance).toBe(9_000);
    expect(result.expenses).toBe(100);
    expect(result.expensesFrom).toBeNull();
    expect(result.forecast).toBe(8_900);
  });

  it("leaves another month's payment out of the selected month", () => {
    const result = view({ month: { year: 2026, month: 11 } });
    expect(result.expenses).toBe(0);
    expect(result.balance).toBe(7_200);
    expect(result.forecast).toBe(7_200);
  });
});
