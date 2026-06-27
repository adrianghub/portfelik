import type { CategoryInsight } from "$lib/services/spending-insight";

export const TOP_SPENDING_CATEGORIES = 6;
export const TOP_SPENDING_MOVERS = 3;
export const CATEGORY_RING_COLORS = ["#34d399", "#a3e635", "#fbbf24", "#fb7185"] as const;
export const CATEGORY_RING_OTHER_COLOR = "rgba(255,255,255,0.18)";

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
  maxSegments = 4
): CategoryRingSegment[] {
  if (spent <= 0) return [];

  const top = topSpendingCategories(categories, maxSegments);
  if (top.length === 0) return [];

  const segments: CategoryRingSegment[] = [];
  let offset = 0;
  let topSum = 0;

  for (const [i, cat] of top.entries()) {
    const arcLen = circumference * (cat.total / spent);
    if (arcLen <= 0) continue;
    topSum += cat.total;
    segments.push({
      key: cat.categoryId,
      name: cat.name,
      arcLen,
      offset,
      color: CATEGORY_RING_COLORS[i % CATEGORY_RING_COLORS.length],
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
