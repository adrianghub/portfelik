import { goto } from "$app/navigation";
import { buildListViewUrl, type DashboardPeriod, type ScopeFilter } from "$lib/utils/list-view-url";

/** Prefer browser back; use fallback when history is empty (direct link, new tab). */
export function navigateBack(fallbackHref: string): void {
  if (typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
    return;
  }
  void goto(fallbackHref);
}

/** Sync hub filters to URL without scroll jump (replaceState). */
export function syncListViewUrl(
  pathname: string,
  current: URLSearchParams,
  patch: { group?: ScopeFilter; period?: DashboardPeriod }
): void {
  void goto(buildListViewUrl(pathname, current, patch), {
    replaceState: true,
    noScroll: true,
    keepFocus: true,
  });
}
