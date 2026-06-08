/** Path with optional query string (preserves drill-down state across plan stack). */
export function withQuery(path: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function planDetailHref(planId: string, searchParams: URLSearchParams): string {
  return withQuery(`/plans/${planId}`, searchParams);
}

export function planSettleHref(planId: string, searchParams: URLSearchParams): string {
  return withQuery(`/plans/${planId}/settle`, searchParams);
}

export function plansHubHref(searchParams: URLSearchParams): string {
  return withQuery("/plans", searchParams);
}
