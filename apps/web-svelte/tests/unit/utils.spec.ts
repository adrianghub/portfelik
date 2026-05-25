import {
  cn,
  formatCurrency,
  formatDate,
  getDateRangeBounds,
  getMonthBounds,
  monthName,
  monthYearLabel,
} from "$lib/utils";
import { describe, expect, it } from "vitest";

function normalizeCurrency(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localMonthStartIso(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString();
}

describe("utils", () => {
  describe("cn", () => {
    it("merges class names and resolves Tailwind conflicts", () => {
      const hidden = false;

      expect(cn("px-2", hidden && "hidden", "px-4")).toBe("px-4");
    });
  });

  describe("formatCurrency", () => {
    it("formats PLN by default", () => {
      expect(normalizeCurrency(formatCurrency(1234.56))).toMatch(/^1 ?234,56 zł$/);
    });

    it("formats an explicit currency", () => {
      const value = normalizeCurrency(formatCurrency(10, "EUR"));

      expect(value).toContain("10,00");
      expect(value).toContain("€");
    });

    it("keeps a minus sign for negative amounts", () => {
      expect(normalizeCurrency(formatCurrency(-12.5))).toMatch(/^[−-]12,50 zł$/);
    });

    it("formats zero", () => {
      expect(normalizeCurrency(formatCurrency(0))).toMatch(/^0,00 zł$/);
    });
  });

  describe("formatDate", () => {
    it("formats an ISO date as a Polish day-month-year date", () => {
      expect(formatDate("2026-05-24")).toBe("24.05.2026");
    });
  });

  describe("date range helpers", () => {
    it("returns month bounds for a mid-year month", () => {
      expect(getMonthBounds(2026, 5)).toEqual({
        start: localMonthStartIso(2026, 5),
        end: localMonthStartIso(2026, 6),
      });
    });

    it("rolls December month bounds into January of the next year", () => {
      expect(getMonthBounds(2026, 12)).toEqual({
        start: localMonthStartIso(2026, 12),
        end: localMonthStartIso(2027, 1),
      });
    });

    it("returns a multi-month date range", () => {
      expect(getDateRangeBounds(2026, 3, 2026, 5)).toEqual({
        start: localMonthStartIso(2026, 3),
        end: localMonthStartIso(2026, 6),
      });
    });

    it("rolls an end month of December into January of the next year", () => {
      expect(getDateRangeBounds(2026, 11, 2026, 12)).toEqual({
        start: localMonthStartIso(2026, 11),
        end: localMonthStartIso(2027, 1),
      });
    });
  });

  describe("month labels", () => {
    it("returns Polish month names", () => {
      expect(monthName(1)).toBe("styczeń");
      expect(monthName(12)).toBe("grudzień");
    });

    it("composes a month-year label", () => {
      expect(monthYearLabel(2026, 5)).toBe("maj 2026");
    });
  });
});
