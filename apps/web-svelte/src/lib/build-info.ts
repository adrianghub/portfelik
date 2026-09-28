import { env } from "$env/dynamic/public";

/** Short git SHA baked in by CI. Empty in local dev. */
export function currentBuildSha(): string | null {
  const raw = env.PUBLIC_BUILD_SHA?.trim() ?? "";
  if (!/^[0-9a-f]{7,40}$/i.test(raw)) return null;
  return raw.slice(0, 7);
}
