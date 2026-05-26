const LOGIN_REDIRECT_STORAGE_KEY = "login_redirect_to";
const AUTH_PATHS = new Set(["/login", "/auth/callback"]);
const URL_BASE = "https://portfelik.local";

export function normalizeLoginRedirect(value: string | null | undefined, fallback = "/"): string {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  try {
    const url = new URL(candidate, URL_BASE);
    if (url.origin !== URL_BASE || AUTH_PATHS.has(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function redirectTargetFromUrl(url: URL, fallback = "/"): string {
  return normalizeLoginRedirect(url.searchParams.get("redirectTo"), fallback);
}

export function loginUrlForTarget(target: string): string {
  const normalized = normalizeLoginRedirect(target);
  return normalized === "/" ? "/login" : `/login?redirectTo=${encodeURIComponent(normalized)}`;
}

export function rememberLoginRedirect(target: string): void {
  if (typeof localStorage === "undefined") return;
  const normalized = normalizeLoginRedirect(target);
  if (normalized === "/") {
    localStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, normalized);
}

export function clearLoginRedirect(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
}

export function consumeLoginRedirect(url?: URL, fallback = "/"): string {
  const queryTarget = url ? redirectTargetFromUrl(url, "") : "";
  if (queryTarget) {
    clearLoginRedirect();
    return queryTarget;
  }

  if (typeof localStorage === "undefined") return fallback;
  const storedTarget = normalizeLoginRedirect(
    localStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY),
    fallback
  );
  clearLoginRedirect();
  return storedTarget;
}
