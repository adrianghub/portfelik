/** First-visit contextual hints — localStorage dismiss, separate from onboarding checklist. */

export type CoachmarkId = "plans_hub" | "transactions_import";

const LS_PREFIX = "coachmark:";

/** Legacy key before coachmarks service existed. */
const LEGACY_KEYS: Partial<Record<CoachmarkId, string>> = {
  plans_hub: "plans-hub-onboarding",
};

export function coachmarkStorageKey(id: CoachmarkId): string {
  return `${LS_PREFIX}${id}`;
}

export function isCoachmarkDismissed(id: CoachmarkId): boolean {
  if (typeof localStorage === "undefined") return false;
  if (localStorage.getItem(coachmarkStorageKey(id)) === "1") return true;
  const legacy = LEGACY_KEYS[id];
  return legacy ? localStorage.getItem(legacy) === "1" : false;
}

export function dismissCoachmark(id: CoachmarkId): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(coachmarkStorageKey(id), "1");
  const legacy = LEGACY_KEYS[id];
  if (legacy) localStorage.setItem(legacy, "1");
}
