import { describe, expect, it } from "vitest";
import { RECURRENCE_DATE_FIXTURES } from "../fixtures/recurrence-date-fixtures";
import {
  isoWeekdayFromDate,
  recurringOccurrenceDates,
  recurringOccurrenceOnDate,
} from "$lib/services/recurrence-dates";

describe("recurringOccurrenceDates — shared fixtures", () => {
  for (const fixture of RECURRENCE_DATE_FIXTURES) {
    it(fixture.name, () => {
      expect(
        recurringOccurrenceDates(fixture.params, fixture.afterExclusive, fixture.beforeExclusive)
      ).toEqual(fixture.expected);
    });
  }
});

describe("recurringOccurrenceOnDate", () => {
  it("returns true only on generated occurrence days", () => {
    const params = {
      anchorDate: "2026-01-10",
      frequency: "monthly" as const,
      interval: 1,
      day: 10,
    };
    expect(recurringOccurrenceOnDate(params, "2026-07-10")).toBe(true);
    expect(recurringOccurrenceOnDate(params, "2026-07-11")).toBe(false);
  });

  it("respects end date", () => {
    const params = {
      anchorDate: "2026-01-10",
      frequency: "monthly" as const,
      interval: 1,
      day: 10,
      endDate: "2026-07-31",
    };
    expect(recurringOccurrenceOnDate(params, "2026-07-10")).toBe(true);
    expect(recurringOccurrenceOnDate(params, "2026-08-10")).toBe(false);
  });
});

describe("isoWeekdayFromDate", () => {
  it("maps Sunday to ISO 7 and Monday to ISO 1", () => {
    expect(isoWeekdayFromDate("2026-06-01")).toBe(1);
    expect(isoWeekdayFromDate("2026-06-07")).toBe(7);
  });
});
