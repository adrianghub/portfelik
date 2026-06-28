import type { ProfileSettings } from "$lib/types";

export type CoreOnboardingStepId = "dashboard" | "import" | "transactions" | "plans";
export type OnboardingStepId = CoreOnboardingStepId | "reminders";

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  optional?: boolean;
}

export interface OnboardingProgress {
  dismissed?: boolean;
  completed?: Partial<Record<OnboardingStepId, boolean>>;
}

export const CORE_ONBOARDING_STEPS: CoreOnboardingStepId[] = [
  "dashboard",
  "import",
  "transactions",
  "plans",
];

export const ALL_ONBOARDING_STEPS: OnboardingStepId[] = [...CORE_ONBOARDING_STEPS, "reminders"];

const LS_DISMISSED = "onboarding-dismissed";

export function readOnboardingProgress(settings: ProfileSettings | undefined): OnboardingProgress {
  const raw = settings?.onboarding;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as OnboardingProgress;
}

export function readOnboardingDismissedLocal(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(LS_DISMISSED) === "1";
}

export function writeOnboardingDismissedLocal(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LS_DISMISSED, "1");
}

export function isCoreOnboardingComplete(progress: OnboardingProgress): boolean {
  if (progress.dismissed) return true;
  const completed = progress.completed ?? {};
  return CORE_ONBOARDING_STEPS.every((id) => completed[id]);
}

/** @deprecated Use isCoreOnboardingComplete — reminders are optional. */
export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return isCoreOnboardingComplete(progress);
}

export function countCoreStepsDone(progress: OnboardingProgress): number {
  const completed = progress.completed ?? {};
  return CORE_ONBOARDING_STEPS.filter((id) => completed[id]).length;
}

export function buildOnboardingSteps(progress: OnboardingProgress): OnboardingStep[] {
  const completed = progress.completed ?? {};
  return ALL_ONBOARDING_STEPS.map((id) => ({
    id,
    done: !!completed[id],
    optional: id === "reminders",
  }));
}

export function mergeOnboardingProgress(
  current: OnboardingProgress,
  patch: Partial<OnboardingProgress>
): OnboardingProgress {
  return {
    ...current,
    ...patch,
    completed: { ...current.completed, ...patch.completed },
  };
}

export function deriveOnboardingFromSignals(input: {
  progress: OnboardingProgress;
  visitedDashboard: boolean;
  hasCommittedImport: boolean;
  transactionCount: number;
  hasPlanOrNetWorth: boolean;
  importReminderEnabled?: boolean;
}): OnboardingProgress {
  const completed = { ...input.progress.completed };
  if (input.visitedDashboard) completed.dashboard = true;
  if (input.hasCommittedImport) completed.import = true;
  if (input.transactionCount > 0) completed.transactions = true;
  if (input.hasPlanOrNetWorth) completed.plans = true;
  if (input.importReminderEnabled) completed.reminders = true;
  return { ...input.progress, completed };
}

/** Returns a completed patch when derived progress advanced beyond stored state. */
export function onboardingCompletionDelta(
  stored: OnboardingProgress,
  derived: OnboardingProgress
): Partial<Record<OnboardingStepId, boolean>> | null {
  const storedCompleted = stored.completed ?? {};
  const derivedCompleted = derived.completed ?? {};
  const patch: Partial<Record<OnboardingStepId, boolean>> = {};
  let changed = false;
  for (const id of ALL_ONBOARDING_STEPS) {
    if (derivedCompleted[id] && !storedCompleted[id]) {
      patch[id] = true;
      changed = true;
    }
  }
  return changed ? patch : null;
}
