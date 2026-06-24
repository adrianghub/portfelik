import type { TransactionWithCategory } from "$lib/types";

/** Safety cap so a daily template across a multi-year span can't explode. */
const MAX_OCCURRENCES_PER_TEMPLATE = 400;

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last calendar day of the given year/monthIndex (UTC). */
function lastDayOfMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

/** Dedup key for an existing real row vs a generated occurrence. */
function periodKey(freq: string, d: Date): string {
  if (freq === "monthly") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  if (freq === "yearly") return String(d.getUTCFullYear());
  return isoDate(d); // daily/weekly: exact day
}

/**
 * Build the ordered list of occurrence dates for one template within
 * (afterMs, beforeMs) — both exclusive. Returns [] for non-recurring or
 * unsupported templates. Pure; no Date mutation leaks out. All calendar math
 * runs in UTC so cursor dates compare apples-to-apples with the span bounds,
 * which `new Date("YYYY-MM-DD")` parses as UTC midnight regardless of host TZ.
 */
function occurrenceDates(t: TransactionWithCategory, afterMs: number, beforeMs: number): Date[] {
  const freq = t.recurrence_frequency;
  if (!t.is_recurring || !freq) return [];
  const interval = Math.max(1, t.recurrence_interval || 1);
  const anchor = new Date(t.date);
  const out: Date[] = [];

  // Seed `cursor` at the first phase-aligned candidate, then step by cadence.
  let cursor: Date;
  if (freq === "daily") {
    cursor = new Date(anchor);
  } else if (freq === "weekly") {
    cursor = new Date(anchor);
    const targetDow = t.recurrence_weekday ?? anchor.getUTCDay();
    const delta = (targetDow - cursor.getUTCDay() + 7) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + delta);
  } else if (freq === "monthly") {
    const day = t.recurring_day ?? anchor.getUTCDate();
    const y = anchor.getUTCFullYear();
    const mi = anchor.getUTCMonth();
    cursor = new Date(Date.UTC(y, mi, Math.min(day, lastDayOfMonth(y, mi))));
  } else {
    // yearly
    const monthIdx = t.recurrence_month != null ? t.recurrence_month - 1 : anchor.getUTCMonth();
    const day = t.recurring_day ?? anchor.getUTCDate();
    const y = anchor.getUTCFullYear();
    cursor = new Date(Date.UTC(y, monthIdx, Math.min(day, lastDayOfMonth(y, monthIdx))));
  }

  const step = (d: Date): Date => {
    if (freq === "daily") {
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + interval);
      return next;
    }
    if (freq === "weekly") {
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 7 * interval);
      return next;
    }
    if (freq === "monthly") {
      const day = t.recurring_day ?? anchor.getUTCDate();
      const m = d.getUTCMonth() + interval;
      const y = d.getUTCFullYear() + Math.floor(m / 12);
      const mi = ((m % 12) + 12) % 12;
      return new Date(Date.UTC(y, mi, Math.min(day, lastDayOfMonth(y, mi))));
    }
    // yearly
    const monthIdx = t.recurrence_month != null ? t.recurrence_month - 1 : anchor.getUTCMonth();
    const day = t.recurring_day ?? anchor.getUTCDate();
    const y = d.getUTCFullYear() + interval;
    return new Date(Date.UTC(y, monthIdx, Math.min(day, lastDayOfMonth(y, monthIdx))));
  };

  // Fast-forward to the first occurrence strictly after `afterMs`.
  // For daily/weekly, compute the first in-span occurrence arithmetically
  // to avoid exhausting iterations on stale anchors (e.g. daily template
  // anchored >400 days before spanStart).
  if (cursor.getTime() <= afterMs) {
    if (freq === "daily") {
      const anchorMs = cursor.getTime();
      const gapDays = Math.ceil((afterMs - anchorMs) / 86_400_000 / interval);
      cursor = new Date(anchorMs + gapDays * interval * 86_400_000);
      // Ensure strictly after afterMs.
      while (cursor.getTime() <= afterMs) cursor = step(cursor);
    } else if (freq === "weekly") {
      const anchorMs = cursor.getTime();
      const stepMs = 7 * interval * 86_400_000;
      const gapWeeks = Math.ceil((afterMs - anchorMs) / stepMs);
      cursor = new Date(anchorMs + gapWeeks * stepMs);
      while (cursor.getTime() <= afterMs) cursor = step(cursor);
    } else {
      // monthly/yearly: step count is bounded by span years, safe to iterate.
      const FF_LIMIT = 5000;
      let ffGuard = 0;
      while (cursor.getTime() <= afterMs && ffGuard++ < FF_LIMIT) {
        cursor = step(cursor);
      }
    }
  }
  // Collect while strictly before `beforeMs`, capped at MAX_OCCURRENCES_PER_TEMPLATE.
  let collected = 0;
  while (cursor.getTime() < beforeMs && collected++ < MAX_OCCURRENCES_PER_TEMPLATE) {
    out.push(new Date(cursor));
    cursor = step(cursor);
  }
  return out;
}

/**
 * Expand recurring templates into virtual `upcoming`, `projected: true`
 * TransactionWithCategory rows whose occurrence dates fall in (spanStart,
 * spanEnd). Derived only — never persisted, never in the ledger, never
 * triggers alerts. `existing` real rows linked to a template are deduped per
 * period so a manually-logged instance isn't double-counted.
 */
export function projectRecurringOccurrences(
  templates: TransactionWithCategory[],
  spanStart: string,
  spanEnd: string,
  existing: TransactionWithCategory[] = []
): TransactionWithCategory[] {
  const afterMs = new Date(spanStart).getTime();
  const beforeMs = new Date(spanEnd).getTime();

  // Pre-index existing real rows by template id + period key.
  const taken = new Set<string>();
  for (const r of existing) {
    if (!r.recurring_template_id) continue;
    const freq = templates.find((t) => t.id === r.recurring_template_id)?.recurrence_frequency;
    if (!freq) continue;
    taken.add(`${r.recurring_template_id}|${periodKey(freq, new Date(r.date))}`);
  }

  const out: TransactionWithCategory[] = [];
  for (const t of templates) {
    const freq = t.recurrence_frequency;
    if (!freq) continue;
    for (const d of occurrenceDates(t, afterMs, beforeMs)) {
      if (taken.has(`${t.id}|${periodKey(freq, d)}`)) continue;
      const date = isoDate(d);
      out.push({
        ...t,
        id: `projected:${t.id}:${date}`,
        date,
        status: "upcoming",
        is_recurring: false,
        recurring_template_id: t.id,
        projected: true,
      });
    }
  }
  return out;
}
