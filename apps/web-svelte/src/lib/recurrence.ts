import * as m from "$lib/paraglide/messages";
import type { RecurrenceFrequency } from "$lib/types";

export interface RecurrenceParts {
  frequency: RecurrenceFrequency | null;
  interval?: number | null;
  /** ISO weekday 1=Mon..7=Sun (weekly rules). */
  weekday?: number | null;
  /** Day of month 1..31 (monthly/yearly rules). */
  day?: number | null;
  /** Month 1..12 (yearly rules). */
  month?: number | null;
}

/** Polish weekday name (nominative) for an ISO weekday (1=Mon..7=Sun). */
export function isoWeekdayName(isoWeekday: number): string {
  // 2024-01-01 is a Monday → Jan {isoWeekday} maps 1..7 to Mon..Sun.
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long" }).format(
    new Date(2024, 0, isoWeekday)
  );
}

/**
 * Human-readable, auditable recurrence sentence (e.g. "Co miesiąc · 15. dnia").
 * Used by the transaction form preview and the detail sheet so the rule is
 * always legible. Locale-safe: weekday via Intl, dates rendered numerically.
 */
export function recurrenceSummary(p: RecurrenceParts): string {
  if (!p.frequency) return "";
  const n = Math.max(p.interval ?? 1, 1);

  switch (p.frequency) {
    case "daily":
      return n === 1 ? m.recurrence_daily() : m.recurrence_daily_n({ count: n });
    case "weekly": {
      const head = n === 1 ? m.recurrence_weekly() : m.recurrence_weekly_n({ count: n });
      return p.weekday ? `${head} · ${isoWeekdayName(p.weekday)}` : head;
    }
    case "monthly": {
      const head = n === 1 ? m.recurrence_monthly() : m.recurrence_monthly_n({ count: n });
      return p.day ? `${head} · ${m.recurrence_day_of_month({ day: p.day })}` : head;
    }
    case "yearly": {
      const head = n === 1 ? m.recurrence_yearly() : m.recurrence_yearly_n({ count: n });
      if (p.day && p.month) {
        const dd = String(p.day).padStart(2, "0");
        const mm = String(p.month).padStart(2, "0");
        return `${head} · ${dd}.${mm}`;
      }
      return head;
    }
  }
}
