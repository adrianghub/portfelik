import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import dayjs, {
  formatDate,
  formatDisplayDate,
  formatMonth,
  formatShortMonth,
  getCurrentMonth,
  getCurrentYear,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  isDateInRange,
} from "./date-utils";

describe("Date Utilities", () => {
  // Set a fixed system date for all tests
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 3, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("getFirstDayOfMonth returns first day of current month", () => {
    const result = getFirstDayOfMonth();
    expect(result.format("YYYY-MM-DD")).toBe("2025-04-01");
  });

  test("getLastDayOfMonth returns last day of current month", () => {
    const result = getLastDayOfMonth();
    expect(result.format("YYYY-MM-DD")).toBe("2025-04-30");
  });

  test("formatMonth returns correct month and year format", () => {
    const date = dayjs("2025-03-15");
    expect(formatMonth(date)).toBe("March 2025");
  });

  test("formatShortMonth returns abbreviated month name", () => {
    const date = dayjs("2025-03-15");
    expect(formatShortMonth(date)).toBe("Mar");
  });

  test("formatDate returns date in YYYY-MM-DD format", () => {
    expect(formatDate("2025-03-15")).toBe("2025-03-15");
    expect(formatDate(new Date(2025, 2, 15))).toBe("2025-03-15");
  });

  test("formatDisplayDate returns date in DD MMM YYYY format", () => {
    expect(formatDisplayDate("2025-03-15")).toBe("15 Mar 2025");
  });

  test("isDateInRange correctly identifies dates within range", () => {
    const start = dayjs("2025-03-01");
    const end = dayjs("2025-03-31");

    expect(isDateInRange("2025-03-15", start, end)).toBe(true);
    expect(isDateInRange("2025-03-01", start, end)).toBe(true);
    expect(isDateInRange("2025-03-31", start, end)).toBe(true);
    expect(isDateInRange("2025-03-30", start, end)).toBe(true);
    expect(isDateInRange("2025-04-01", start, end)).toBe(false);
  });

  test("getCurrentMonth returns the current month (0-based index)", () => {
    expect(getCurrentMonth()).toBe(3); // March is month 3 in 0-based index
  });

  test("getCurrentYear returns the current year", () => {
    expect(getCurrentYear()).toBe(2025);
  });
});
