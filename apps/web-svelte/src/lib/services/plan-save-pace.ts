/** Shared save-goal monthly pace helpers (dashboard attention + plans surplus queue). */

export interface SavePaceFields {
  kind: string;
  monthlyNeeded: number | null;
  monthlyActual: number | null;
  monthlyActualBasis: string;
}

export function currentMonthSavePace(
  plan: Pick<SavePaceFields, "monthlyActual" | "monthlyActualBasis">
): number {
  return plan.monthlyActualBasis === "current-month" ? (plan.monthlyActual ?? 0) : 0;
}

export function isSavePlanOffTrack(plan: SavePaceFields): boolean {
  if (plan.kind !== "save") return false;
  if (plan.monthlyNeeded == null || plan.monthlyNeeded <= 0) return false;
  return currentMonthSavePace(plan) < plan.monthlyNeeded - 0.01;
}

export function pickMostUrgentOffTrackSave<T extends SavePaceFields>(
  plans: T[],
  filter?: (plan: T) => boolean
): T | undefined {
  return plans
    .filter((p) => isSavePlanOffTrack(p) && (filter?.(p) ?? true))
    .sort((a, b) => savePlanShortfall(b) - savePlanShortfall(a))[0];
}

/** Rank off-track save plans by severity (absolute monthly shortfall). */
export function savePlanShortfall(plan: SavePaceFields): number {
  if (!isSavePlanOffTrack(plan) || plan.monthlyNeeded == null) return 0;
  return plan.monthlyNeeded - currentMonthSavePace(plan);
}
