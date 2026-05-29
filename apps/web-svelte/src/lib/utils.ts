import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "PLN"): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(amount);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function getMonthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function getDateRangeBounds(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): { start: string; end: string } {
  return {
    start: new Date(startYear, startMonth - 1, 1).toISOString(),
    end: new Date(endYear, endMonth, 1).toISOString(),
  };
}

/**
 * Build the transactions list URL filtered to a year/month range. Used after a
 * bank import commit (and the already-imported panel) to land the user on the
 * exact period they just imported. Returns the bare `/transactions` path when
 * no range is given.
 */
export function transactionsUrlForRange(range?: {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}): string {
  if (!range) return "/transactions";
  const params = new URLSearchParams({
    startYear: String(range.startYear),
    startMonth: String(range.startMonth),
    endYear: String(range.endYear),
    endMonth: String(range.endMonth),
  });
  return `/transactions?${params.toString()}`;
}

export function monthName(month: number): string {
  return new Intl.DateTimeFormat("pl-PL", { month: "long" }).format(new Date(2000, month - 1, 1));
}

export function monthYearLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

/**
 * Polish locative month forms ("w maju", "w czerwcu"). `Intl` only yields the
 * nominative ("maj"), which is grammatically wrong after the preposition "w",
 * so the locative forms are hard-coded. Lowercase by convention (mid-sentence).
 */
const MONTH_LOCATIVE_PL = [
  "styczniu",
  "lutym",
  "marcu",
  "kwietniu",
  "maju",
  "czerwcu",
  "lipcu",
  "sierpniu",
  "wrześniu",
  "październiku",
  "listopadzie",
  "grudniu",
] as const;

export function monthNameLocative(month: number): string {
  return MONTH_LOCATIVE_PL[month - 1] ?? monthName(month);
}

/**
 * When an explicit day range spans exactly one whole calendar month (1st →
 * last day, same year), return that month so callers can show "Maj 2026"
 * instead of "1–31 maj 2026". Inputs are `YYYY-MM-DD` strings. Returns null
 * for any partial or multi-month range.
 */
export function fullMonthOf(
  startIso: string,
  endIso: string
): { year: number; month: number } | null {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return null;
  if (sy !== ey || sm !== em || sd !== 1) return null;
  const lastDay = new Date(sy, sm, 0).getDate();
  return ed === lastDay ? { year: sy, month: sm } : null;
}
