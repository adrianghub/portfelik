import type { CategoryInsight } from "$lib/services/spending-insight";

export const TOP_SPENDING_CATEGORIES = 6;
export const TOP_SPENDING_MOVERS = 3;
/** Dashboard card preview — full lists open in a dialog. */
export const DASHBOARD_PREVIEW_CATEGORIES = 3;
export const DASHBOARD_PREVIEW_MOVERS = 3;
export const CATEGORY_RING_COLORS = [
  "#34d399",
  "#38bdf8",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#22d3ee",
  "#f472b6",
  "#fb923c",
] as const;
export const CATEGORY_RING_OTHER_COLOR = "rgba(255,255,255,0.18)";
export const CATEGORY_HISTORY_OTHER_COLOR = "#94a3b8";

/** Stable category identity keeps colors unchanged when spend rankings change. */
export function categoryColor(identity: string, chosen?: string | null): string {
  if (chosen && CATEGORY_RING_COLORS.some((color) => color === chosen)) return chosen;
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++)
    hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  return CATEGORY_RING_COLORS[(hash >>> 0) % CATEGORY_RING_COLORS.length];
}

export type CategoryRingSegment = {
  key: string;
  name: string;
  arcLen: number;
  offset: number;
  color: string;
};

export function categorySharePct(total: number, spent: number): number {
  if (spent <= 0) return 0;
  return Math.round((total / spent) * 100);
}

export function formatDeltaPct(pct: number | null): string {
  if (pct === null) return "";
  const arrow = pct >= 0 ? "↑" : "↓";
  return `${arrow}${Math.abs(Math.round(pct))}%`;
}

export function isSignificantDeltaPct(pct: number | null): pct is number {
  return pct !== null && Math.round(Math.abs(pct)) > 0;
}

export function topSpendingCategories(
  categories: CategoryInsight[],
  n = TOP_SPENDING_CATEGORIES
): CategoryInsight[] {
  return categories.filter((c) => c.total > 0).slice(0, n);
}

export function topSpendingMovers(
  movers: CategoryInsight[],
  n = TOP_SPENDING_MOVERS
): CategoryInsight[] {
  return movers.filter((c) => c.deltaAbs !== 0).slice(0, n);
}

export function categoryRingSegments(
  categories: CategoryInsight[],
  spent: number,
  circumference: number,
  maxSegments = 4,
  colors?: ReadonlyMap<string, string>
): CategoryRingSegment[] {
  if (spent <= 0) return [];

  const top = topSpendingCategories(categories, maxSegments);
  if (top.length === 0) return [];

  const segments: CategoryRingSegment[] = [];
  let offset = 0;
  let topSum = 0;

  for (const cat of top) {
    const arcLen = circumference * (cat.total / spent);
    if (arcLen <= 0) continue;
    topSum += cat.total;
    segments.push({
      key: cat.categoryId,
      name: cat.name,
      arcLen,
      offset,
      color: categoryColor(cat.categoryId, colors?.get(cat.categoryId)),
    });
    offset += arcLen;
  }

  const remainder = spent - topSum;
  if (remainder > 0.005) {
    segments.push({
      key: "__other__",
      name: "Inne",
      arcLen: circumference * (remainder / spent),
      offset,
      color: CATEGORY_RING_OTHER_COLOR,
    });
  }

  return segments;
}
