export type ScopeFilter = "all" | "own" | (string & {});
export type DashboardPeriod = "week" | "month" | "year";

export function parseScopeFilter(params: URLSearchParams): ScopeFilter {
  const raw = params.get("group");
  if (raw === "own") return "own";
  if (!raw || raw === "all") return "all";
  return raw;
}

export function writeScopeFilter(params: URLSearchParams, scope: ScopeFilter): void {
  if (scope === "all") params.delete("group");
  else params.set("group", scope);
}

export function parseDashboardPeriod(params: URLSearchParams): DashboardPeriod {
  const raw = params.get("period");
  if (raw === "week" || raw === "year") return raw;
  return "month";
}

export function writeDashboardPeriod(params: URLSearchParams, period: DashboardPeriod): void {
  if (period === "month") params.delete("period");
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
