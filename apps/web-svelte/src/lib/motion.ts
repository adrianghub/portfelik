/**
 * Motion helpers that honor `prefers-reduced-motion`.
 *
 * Svelte transition/animate functions don't auto-consult the media query;
 * pass the result of `motionDuration(N)` into their `duration` prop so the
 * call reduces to ~0ms when the user opts out.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}
