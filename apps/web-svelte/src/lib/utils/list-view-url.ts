export type ScopeFilter = "all" | "own" | (string & {});
export type DashboardPeriod = "week" | "month" | "year" | "custom";

/** Inclusive date-only range picked via the dashboard date-range picker. */
export interface DashboardRange {
  start: string;
  end: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseScopeFilter(params: URLSearchParams): ScopeFilter {
  const raw = params.get("group");
  if (raw === "all") return "all";
  if (!raw || raw === "own") return "own";
  return raw;
}

export function writeScopeFilter(params: URLSearchParams, scope: ScopeFilter): void {
  // "own" is the default scope ("see mine first"), so it is the omitted canonical.
  if (scope === "own") params.delete("group");
  else params.set("group", scope);
}

export function parseDashboardRange(params: URLSearchParams): DashboardRange | null {
  const start = params.get("startDate");
  const end = params.get("endDate");
  if (!start || !end || !DATE_ONLY.test(start) || !DATE_ONLY.test(end)) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

export function parseDashboardPeriod(params: URLSearchParams): DashboardPeriod {
  // An explicit date range wins over the period chip — same params as /transactions.
  if (parseDashboardRange(params)) return "custom";
  const raw = params.get("period");
  if (raw === "month" || raw === "year") return raw;
  return "week";
}

export function writeDashboardPeriod(params: URLSearchParams, period: DashboardPeriod): void {
  params.delete("startDate");
  params.delete("endDate");
  // "week" is the default; "custom" only exists through an explicit range.
  if (period === "week" || period === "custom") params.delete("period");
  else params.set("period", period);
}

export function writeDashboardRange(params: URLSearchParams, range: DashboardRange): void {
  params.delete("period");
  params.set("startDate", range.start);
  params.set("endDate", range.end);
}

export function buildListViewUrl(
  pathname: string,
  current: URLSearchParams,
  patch: { group?: ScopeFilter; period?: DashboardPeriod; range?: DashboardRange }
): string {
  const params = new URLSearchParams(current);
  if (patch.group !== undefined) writeScopeFilter(params, patch.group);
  if (patch.range !== undefined) writeDashboardRange(params, patch.range);
  else if (patch.period !== undefined) writeDashboardPeriod(params, patch.period);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
