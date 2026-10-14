import { describe, expect, it } from "vitest";
import {
  clampIsoDate,
  debtSettleMaxDate,
  installmentDayOfMonth,
  nextInstallmentDate,
  scheduleInstallmentStart,
} from "$lib/services/debt-installment-draft";

describe("debt installment draft helpers", () => {
  it("picks the next day-of-month on or after from", () => {
    expect(nextInstallmentDate("2026-10-14", 10)).toBe("2026-11-10");
    expect(nextInstallmentDate("2026-10-10", 10)).toBe("2026-10-10");
    expect(nextInstallmentDate("2026-01-31", 31)).toBe("2026-01-31");
    expect(nextInstallmentDate("2026-01-31", 30)).toBe("2026-02-28");
  });

  it("reads installment day from first payment date", () => {
    expect(installmentDayOfMonth("2026-07-10", "2026-10-14")).toBe(10);
    expect(installmentDayOfMonth(null, "2026-10-14")).toBe(14);
  });

  it("keeps a future first-payment date instead of inventing earlier months", () => {
    expect(scheduleInstallmentStart("2026-10-14", "2027-01-10")).toEqual({
      date: "2027-01-10",
      dayOfMonth: 10,
    });
    expect(scheduleInstallmentStart("2026-10-14", "2026-07-10")).toEqual({
      date: "2026-11-10",
      dayOfMonth: 10,
    });
  });

  it("caps debt settle dates at today", () => {
    expect(debtSettleMaxDate("2026-10-14")).toBe("2026-10-14");
    expect(clampIsoDate("2026-11-01", "2026-07-01", debtSettleMaxDate("2026-10-14"))).toBe(
      "2026-10-14"
    );
  });
});
