import type { TransactionWithCategory } from "$lib/types";

/** Dashboard comparison granularities. Mirrors the Tydzień / Miesiąc / Rok toggle. */
export type PeriodKind = "week" | "month" | "year";

export interface PeriodWindow {
  /** Short axis label, e.g. "12.06", "Cze", "2025". */
  label: string;
  /** Inclusive ISO start. */
  start: string;
  /** Exclusive ISO end. */
  end: string;
}

export interface PeriodCategoryTotal {
  name: string;
  total: number;
}

export interface PeriodHistoryBucket extends PeriodWindow {
  /** Total expense in the window. */
  total: number;
  /** Per-category expense totals, descending. For tooltips. */
  categories: PeriodCategoryTotal[];
  /** True for the period containing "now" (the rightmost, in-progress bucket). */
  isCurrent: boolean;
  /** True for read-time projected (forecast) buckets. */
  isProjected?: boolean;
}

const MONTH_SHORT_PL = [
  "Sty",
  "Lut",
  "Mar",
  "Kwi",
  "Maj",
  "Cze",
  "Lip",
  "Sie",
  "Wrz",
  "Paź",
  "Lis",
  "Gru",
];

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** UTC-midnight ISO string for a given UTC timestamp. */
function utcIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Build the last `count` period windows ending with the one containing `ref`,
 * oldest first. Week windows are 7-day spans aligned to the same trailing
 * 7-days-ending-today convention the dashboard uses for its current week.
 */
export function buildPeriodWindows(
  kind: PeriodKind,
  count: number,
  ref: Date = new Date()
): PeriodWindow[] {
  const windows: PeriodWindow[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (kind === "week") {
      // Trailing 7-day window aligned to `ref` day, all in UTC.
      const refMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
      const startMs = refMs - (6 + 7 * i) * 86_400_000;
      const endMs = startMs + 7 * 86_400_000;
      const s = new Date(startMs);
      const dd = s.getUTCDate();
      const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
      windows.push({ label: `${dd}.${mm}`, start: isoDate(s), end: isoDate(new Date(endMs)) });
    } else if (kind === "month") {
      const startMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1);
      const d = new Date(startMs);
      const endMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      windows.push({
        label: MONTH_SHORT_PL[d.getUTCMonth()],
        start: utcIso(startMs),
        end: utcIso(endMs),
      });
    } else {
      const y = ref.getUTCFullYear() - i;
      windows.push({
        label: String(y),
        start: utcIso(Date.UTC(y, 0, 1)),
        end: utcIso(Date.UTC(y + 1, 0, 1)),
      });
    }
  }
  return windows;
}

/**
 * Build the next `count` period windows strictly AFTER the period containing
 * `ref` (the in-progress current period), oldest-first. Mirrors the window math
 * in `buildPeriodWindows` so past + forward windows tile without gaps/overlap.
 */
export function buildForwardPeriodWindows(
  kind: PeriodKind,
  count: number,
  ref: Date = new Date()
): PeriodWindow[] {
  const windows: PeriodWindow[] = [];
  for (let i = 1; i <= count; i++) {
    if (kind === "week") {
      // Current week = trailing 7 days ending today (start = today - 6).
      // Forward week i starts at today - 6 + 7*i.
      const refMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
      const startMs = refMs + (-6 + 7 * i) * 86_400_000;
      const endMs = startMs + 7 * 86_400_000;
      const s = new Date(startMs);
      const dd = s.getUTCDate();
      const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
      windows.push({ label: `${dd}.${mm}`, start: isoDate(s), end: isoDate(new Date(endMs)) });
    } else if (kind === "month") {
      const startMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + i, 1);
      const d = new Date(startMs);
      const endMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      windows.push({
        label: MONTH_SHORT_PL[d.getUTCMonth()],
        start: utcIso(startMs),
        end: utcIso(endMs),
      });
    } else {
      const y = ref.getUTCFullYear() + i;
      windows.push({
        label: String(y),
        start: utcIso(Date.UTC(y, 0, 1)),
        end: utcIso(Date.UTC(y + 1, 0, 1)),
      });
    }
  }
  return windows;
}

/**
 * Sum expense amounts into the given windows. `txs` must already be the scoped
 * ledger transactions. Pure: window math lives in `buildPeriodWindows`.
 */
export function bucketPeriodHistory(
  txs: TransactionWithCategory[],
  windows: PeriodWindow[]
): PeriodHistoryBucket[] {
  const nowMs = Date.now();
  return windows.map((w) => {
    const startMs = new Date(w.start).getTime();
    const endMs = new Date(w.end).getTime();
    const byCat = new Map<string, number>();
    let total = 0;
    for (const t of txs) {
      if (t.type !== "expense") continue;
      const ts = new Date(t.date).getTime();
      if (ts < startMs || ts >= endMs) continue;
      const amt = Math.abs(Number(t.amount));
      total += amt;
      byCat.set(t.category_name, (byCat.get(t.category_name) ?? 0) + amt);
    }
    const categories = [...byCat.entries()]
      .map(([name, catTotal]) => ({ name, total: catTotal }))
      .sort((a, b) => b.total - a.total);
    return { ...w, total, categories, isCurrent: nowMs >= startMs && nowMs < endMs };
  });
}

export interface StackedCategoryHistory {
  /** Ordered category keys (top spenders first, optional "Inne" bucket last). */
  categories: string[];
  /** One row per period: { label, [category]: amount }. Shaped for a stacked BarChart. */
  rows: Array<Record<string, number> & { label: string }>;
}

/**
 * Collapse per-period category breakdowns into a stacked-bar shape: the top `topN`
 * categories by total across all periods become their own stack segment; everything
 * else folds into a single `otherLabel` segment. This same category×period matrix is
 * the substrate for future AI "what changed" narration.
 */
export function stackCategoryHistory(
  buckets: PeriodHistoryBucket[],
  topN = 5,
  otherLabel = "Inne"
): StackedCategoryHistory {
  const totals = new Map<string, number>();
  for (const b of buckets) {
    for (const c of b.categories) totals.set(c.name, (totals.get(c.name) ?? 0) + c.total);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const top = ranked.slice(0, topN);
  const hasOther = ranked.length > topN;
  const categories = hasOther ? [...top, otherLabel] : top;
  const topSet = new Set(top);

  const rows = buckets.map((b) => {
    const row = { label: b.label } as Record<string, number> & { label: string };
    for (const cat of categories) row[cat] = 0;
    for (const c of b.categories) {
      const key = topSet.has(c.name) ? c.name : hasOther ? otherLabel : null;
      if (key) row[key] = Math.round(row[key] + c.total);
    }
    return row;
  });
  return { categories, rows };
}

/** Convenience: windows + bucketing in one call. */
export function computePeriodHistory(
  txs: TransactionWithCategory[],
  kind: PeriodKind,
  count: number,
  ref: Date = new Date()
): PeriodHistoryBucket[] {
  return bucketPeriodHistory(txs, buildPeriodWindows(kind, count, ref));
}
