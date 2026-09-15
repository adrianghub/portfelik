export type NativeBackDestination =
  { kind: "minimize" } | { kind: "goto"; href: string } | { kind: "history-back" };

const ROOT_PATHS = new Set([
  "/",
  "/dashboard",
  "/transactions",
  "/plans",
  "/settings",
  "/admin",
  "/login",
]);

function withSearch(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Where Android hardware back should go after overlays and page guards. */
export function nativeBackDestination(pathname: string, search = ""): NativeBackDestination {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  if (pathname === "/settings" && params.has("tab")) {
    return { kind: "goto", href: "/settings" };
  }

  const settleMatch = pathname.match(/^\/plans\/([^/]+)\/settle\/?$/);
  if (settleMatch?.[1]) {
    return { kind: "goto", href: withSearch(`/plans/${settleMatch[1]}`, params) };
  }

  const planMatch = pathname.match(/^\/plans\/([^/]+)\/?$/);
  if (planMatch?.[1]) {
    return { kind: "goto", href: withSearch("/plans", params) };
  }

  if (pathname === "/import" || pathname === "/transactions/import") {
    return { kind: "goto", href: "/transactions" };
  }

  if (pathname === "/admin/notifications") {
    return { kind: "goto", href: "/admin" };
  }

  if (ROOT_PATHS.has(pathname)) {
    return { kind: "minimize" };
  }

  return { kind: "history-back" };
}
