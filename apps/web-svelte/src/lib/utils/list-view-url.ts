export type ScopeFilter = "all" | "own" | (string & {});
export type DashboardPeriod = "week" | "month" | "year";

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

export function parseDashboardPeriod(params: URLSearchParams): DashboardPeriod {
  const raw = params.get("period");
  if (raw === "month" || raw === "year") return raw;
  return "week";
}

export function writeDashboardPeriod(params: URLSearchParams, period: DashboardPeriod): void {
  if (period === "week") params.delete("period");
  else params.set("period", period);
}

export function buildListViewUrl(
  pathname: string,
  current: URLSearchParams,
  patch: { group?: ScopeFilter; period?: DashboardPeriod }
): string {
  const params = new URLSearchParams(current);
  if (patch.group !== undefined) writeScopeFilter(params, patch.group);
  if (patch.period !== undefined) writeDashboardPeriod(params, patch.period);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
