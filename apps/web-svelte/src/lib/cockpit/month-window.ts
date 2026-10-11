import { addLocalDays } from "$lib/date-local";

export interface CalendarMonth {
  year: number;
  /** 1-12. */
  month: number;
}

const CASH_MONTH = /^(\d{4})-(\d{2})$/;

export function calendarMonthFromIso(iso: string): CalendarMonth {
  const [year, month] = iso.slice(0, 10).split("-").map(Number);
  return { year, month };
}

export function calendarMonthBounds(month: CalendarMonth): {
  monthStart: string;
  monthEnd: string;
} {
  const monthStart = `${String(month.year).padStart(4, "0")}-${String(month.month).padStart(2, "0")}-01`;
  const lastDay = new Date(month.year, month.month, 0).getDate();
  const monthEnd = `${monthStart.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
  return { monthStart, monthEnd };
}

export function shiftCalendarMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const shifted = new Date(month.year, month.month - 1 + delta, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

export function parseCashMonthParam(value: string | null, today: string): CalendarMonth {
  const fallback = calendarMonthFromIso(today);
  if (!value) return fallback;
  const match = CASH_MONTH.exec(value);
  if (!match) return fallback;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return fallback;
  return { year: Number(match[1]), month };
}

/** Current month stays out of the URL. Other months use YYYY-MM. */
export function cashMonthQueryValue(month: CalendarMonth, today: string): string | null {
  const current = calendarMonthFromIso(today);
  if (month.year === current.year && month.month === current.month) return null;
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

/** Inclusive month fetch. `endExclusive` is the day after `monthEnd`. */
export function cockpitMonthFetchBounds(month: CalendarMonth): {
  start: string;
  endExclusive: string;
} {
  const { monthStart, monthEnd } = calendarMonthBounds(month);
  return { start: monthStart, endExclusive: addLocalDays(monthEnd, 1) };
}

/**
 * True only when [rangeStart, rangeEndExclusive) contains every day of the
 * inclusive month. A range that stops on the last day does not cover it.
 */
export function ledgerRangeCoversMonth(
  rangeStart: string,
  rangeEndExclusive: string,
  monthStart: string,
  monthEnd: string
): boolean {
  return rangeStart <= monthStart && rangeEndExclusive > monthEnd;
}

export function calendarMonthLabel(month: CalendarMonth): string {
  const formatted = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(month.year, month.month - 1, 1));
  const label = formatted.replace(/\s+/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
