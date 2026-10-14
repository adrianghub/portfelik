import { localDateIso } from "$lib/date-local";

/** Clamp day into the calendar month of `year-month` (1-based month). */
function clampDom(year: number, month: number, day: number): number {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

/**
 * Next installment calendar date on `dayOfMonth` on or after `from` (YYYY-MM-DD).
 * Used to prefill „Zaplanuj raty” from debt terms.
 */
export function nextInstallmentDate(from: string, dayOfMonth: number): string {
  const base = from.slice(0, 10);
  const year = Number(base.slice(0, 4));
  const month = Number(base.slice(5, 7));
  const day = Number(base.slice(8, 10));
  if (![year, month, day].every(Number.isFinite)) return localDateIso();
  const dom = clampDom(year, month, dayOfMonth);
  if (day <= dom) {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(dom).padStart(2, "0")}`;
  }
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextDom = clampDom(nextYear, nextMonth, dayOfMonth);
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-${String(nextDom).padStart(2, "0")}`;
}

/** Prefer agreement first-payment day; otherwise day-of-month from `from`. */
export function installmentDayOfMonth(
  firstPaymentDate: string | null | undefined,
  from: string
): number {
  if (firstPaymentDate && /^\d{4}-\d{2}-\d{2}/.test(firstPaymentDate)) {
    return Number(firstPaymentDate.slice(8, 10));
  }
  return Number(from.slice(8, 10)) || 1;
}

/**
 * First draft installment date for „Zaplanuj raty”.
 * Future `first_payment_date` is kept as-is; historical ones advance from today.
 */
export function scheduleInstallmentStart(
  today: string,
  firstPaymentDate: string | null | undefined
): { date: string; dayOfMonth: number } {
  const from = today.slice(0, 10);
  const first =
    firstPaymentDate && /^\d{4}-\d{2}-\d{2}/.test(firstPaymentDate)
      ? firstPaymentDate.slice(0, 10)
      : null;
  const dayOfMonth = installmentDayOfMonth(first, from);
  if (first && first > from) return { date: first, dayOfMonth };
  return { date: nextInstallmentDate(from, dayOfMonth), dayOfMonth };
}

/** Latest date allowed when booking a paid debt installment (today, local). */
export function debtSettleMaxDate(today: string = localDateIso()): string {
  return today.slice(0, 10);
}

/** Clamp a candidate date into [min, max] when bounds are set. */
export function clampIsoDate(date: string, min?: string, max?: string): string {
  let next = date.slice(0, 10);
  if (min && next < min) next = min;
  if (max && next > max) next = max;
  return next;
}
