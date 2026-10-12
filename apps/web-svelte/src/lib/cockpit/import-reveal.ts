const REVEAL_KEY = "cockpit-import-reveal";

/** Remember one cockpit reveal until the next dashboard visit in this tab. */
export function markCockpitImportReveal(count: number): void {
  if (typeof sessionStorage === "undefined" || count <= 0) return;
  sessionStorage.setItem(REVEAL_KEY, String(Math.round(count)));
}

/** Read and consume the reveal. Later opens in a new tab stay still. */
export function takeCockpitImportReveal(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(REVEAL_KEY);
  if (raw == null) return null;
  sessionStorage.removeItem(REVEAL_KEY);
  const count = Number(raw);
  return Number.isInteger(count) && count > 0 ? count : null;
}
