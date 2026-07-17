import type { RecurrenceFrequency } from "$lib/types";

/** Safety cap so a daily template across a multi-year span cannot explode. */
export const MAX_RECURRENCE_OCCURRENCES = 400;

export interface RecurrenceDateParams {
  anchorDate: string;
  frequency: RecurrenceFrequency;
  interval?: number | null;
  /** ISO weekday 1=Mon..7=Sun (weekly). */
  weekday?: number | null;
  /** Day of month 1..31 (monthly/yearly). */
  day?: number | null;
  /** Month 1..12 (yearly). */
  month?: number | null;
  /** Inclusive last calendar day the series may generate; null = open-ended. */
  endDate?: string | null;
}

function parseUtcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO weekday 1=Mon..7=Sun for a calendar date string. */
export function isoWeekdayFromDate(iso: string): number {
  const js = parseUtcDate(iso).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Last calendar day of the given year/month (1-based month). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

function alignCursor(params: RecurrenceDateParams): Date {
  const anchor = parseUtcDate(params.anchorDate);
  const freq = params.frequency;

  if (freq === "daily") {
    return new Date(anchor);
  }

  if (freq === "weekly") {
    const cursor = new Date(anchor);
    const targetDow = params.weekday ?? isoWeekdayFromDate(params.anchorDate);
    const anchorDow = isoWeekdayFromDate(params.anchorDate);
    const delta = (targetDow - anchorDow + 7) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + delta);
    return cursor;
  }

  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth() + 1;
  const day = params.day ?? anchor.getUTCDate();

  if (freq === "monthly") {
    return new Date(Date.UTC(anchorYear, anchorMonth - 1, clampDay(anchorYear, anchorMonth, day)));
  }

  const month = params.month ?? anchorMonth;
  return new Date(Date.UTC(anchorYear, month - 1, clampDay(anchorYear, month, day)));
}

function stepCursor(cursor: Date, params: RecurrenceDateParams, anchor: Date): Date {
  const interval = Math.max(1, params.interval ?? 1);
  const freq = params.frequency;

  if (freq === "daily") {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + interval);
    return next;
  }

  if (freq === "weekly") {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 7 * interval);
    return next;
  }

  const day = params.day ?? anchor.getUTCDate();

  if (freq === "monthly") {
    const monthIndex = cursor.getUTCMonth() + interval;
    const year = cursor.getUTCFullYear() + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return new Date(Date.UTC(year, month - 1, clampDay(year, month, day)));
  }

  const month = params.month ?? anchor.getUTCMonth() + 1;
  const year = cursor.getUTCFullYear() + interval;
  return new Date(Date.UTC(year, month - 1, clampDay(year, month, day)));
}

function fastForwardCursor(
  cursor: Date,
  params: RecurrenceDateParams,
  afterExclusiveMs: number
): Date {
  if (cursor.getTime() > afterExclusiveMs) return cursor;

  const interval = Math.max(1, params.interval ?? 1);
  const freq = params.frequency;

  if (freq === "daily") {
    const anchorMs = cursor.getTime();
    const gapDays = Math.ceil((afterExclusiveMs - anchorMs) / 86_400_000 / interval);
    let next = new Date(anchorMs + gapDays * interval * 86_400_000);
    while (next.getTime() <= afterExclusiveMs) {
      next = stepCursor(next, params, parseUtcDate(params.anchorDate));
    }
    return next;
  }

  if (freq === "weekly") {
    const anchorMs = cursor.getTime();
    const stepMs = 7 * interval * 86_400_000;
    const gapWeeks = Math.ceil((afterExclusiveMs - anchorMs) / stepMs);
    let next = new Date(anchorMs + gapWeeks * stepMs);
    while (next.getTime() <= afterExclusiveMs) {
      next = stepCursor(next, params, parseUtcDate(params.anchorDate));
    }
    return next;
  }

  let next = new Date(cursor);
  let guard = 0;
  while (next.getTime() <= afterExclusiveMs && guard++ < 5000) {
    next = stepCursor(next, params, parseUtcDate(params.anchorDate));
  }
  return next;
}

/**
 * Canonical recurrence date list for one template within (afterExclusive, beforeExclusive).
 * Both bounds are exclusive. Occurrences never fall before anchorDate; endDate is inclusive.
 * Calendar math uses UTC date parts so YYYY-MM-DD strings compare consistently.
 */
export function recurringOccurrenceDates(
  params: RecurrenceDateParams,
  afterExclusive: string,
  beforeExclusive: string,
  maxCount = MAX_RECURRENCE_OCCURRENCES
): string[] {
  const anchorMs = parseUtcDate(params.anchorDate).getTime();
  const afterMs = parseUtcDate(afterExclusive).getTime();
  const beforeMs = parseUtcDate(beforeExclusive).getTime();
  const endMs = params.endDate ? parseUtcDate(params.endDate).getTime() : Number.POSITIVE_INFINITY;

  let cursor = alignCursor(params);
  cursor = fastForwardCursor(cursor, params, afterMs);

  const anchor = parseUtcDate(params.anchorDate);
  const out: string[] = [];
  let collected = 0;

  while (cursor.getTime() < beforeMs && collected++ < maxCount) {
    const ms = cursor.getTime();
    if (ms > afterMs && ms >= anchorMs && ms <= endMs) {
      out.push(isoDate(cursor));
    }
    cursor = stepCursor(cursor, params, anchor);
  }

  return out;
}

/** True when referenceDate is a generated occurrence for the template params. */
export function recurringOccurrenceOnDate(
  params: RecurrenceDateParams,
  referenceDate: string
): boolean {
  const dayBefore = isoDate(new Date(parseUtcDate(referenceDate).getTime() - 86_400_000));
  const dayAfter = isoDate(new Date(parseUtcDate(referenceDate).getTime() + 86_400_000));
  return recurringOccurrenceDates(params, dayBefore, dayAfter, 1).includes(referenceDate);
}
