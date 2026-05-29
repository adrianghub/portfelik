import { describe, expect, it } from "vitest";
import { isoWeekdayName, recurrenceSummary } from "$lib/recurrence";

describe("isoWeekdayName", () => {
  it("maps ISO weekday 1..7 to Polish Mon..Sun", () => {
    expect(isoWeekdayName(1)).toBe("poniedziałek");
    expect(isoWeekdayName(3)).toBe("środa");
    expect(isoWeekdayName(7)).toBe("niedziela");
  });
});

describe("recurrenceSummary", () => {
  it("returns empty string when no frequency", () => {
    expect(recurrenceSummary({ frequency: null })).toBe("");
  });

  it("daily", () => {
    expect(recurrenceSummary({ frequency: "daily", interval: 1 })).toBe("Codziennie");
    expect(recurrenceSummary({ frequency: "daily", interval: 3 })).toBe("Co 3 dni");
  });

  it("weekly includes the weekday", () => {
    expect(recurrenceSummary({ frequency: "weekly", interval: 1, weekday: 3 })).toBe(
      "Co tydzień · środa"
    );
    expect(recurrenceSummary({ frequency: "weekly", interval: 2, weekday: 1 })).toBe(
      "Co 2 tyg. · poniedziałek"
    );
  });

  it("monthly includes day of month", () => {
    expect(recurrenceSummary({ frequency: "monthly", interval: 1, day: 15 })).toBe(
      "Co miesiąc · 15. dnia"
    );
    expect(recurrenceSummary({ frequency: "monthly", interval: 2, day: 1 })).toBe(
      "Co 2 mies. · 1. dnia"
    );
  });

  it("yearly renders a numeric day.month", () => {
    expect(recurrenceSummary({ frequency: "yearly", interval: 1, day: 15, month: 6 })).toBe(
      "Co rok · 15.06"
    );
    expect(recurrenceSummary({ frequency: "yearly", interval: 5, day: 1, month: 1 })).toBe(
      "Co 5 lat · 01.01"
    );
  });

  it("treats interval < 1 as 1", () => {
    expect(recurrenceSummary({ frequency: "daily", interval: 0 })).toBe("Codziennie");
  });

  it("omits the detail when a required part is missing", () => {
    expect(recurrenceSummary({ frequency: "weekly", interval: 1 })).toBe("Co tydzień");
    expect(recurrenceSummary({ frequency: "yearly", interval: 1, day: 15 })).toBe("Co rok");
  });
});
