const PREFIX = "scroll:";

export function scrollRestoreKey(pathname: string): string {
  return `${PREFIX}${pathname}`;
}

export function saveScrollPosition(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, String(window.scrollY));
}

export function restoreScrollPosition(key: string): void {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem(key);
  if (raw == null) return;
  const y = Number(raw);
  if (!Number.isFinite(y)) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: y, left: 0, behavior: "instant" });
    sessionStorage.removeItem(key);
  });
}
