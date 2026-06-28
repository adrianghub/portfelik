import type { ProfileSettings } from "$lib/types";

export type OnboardingStepId = "dashboard" | "import" | "transactions" | "plans";

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
}

export interface OnboardingProgress {
  dismissed?: boolean;
  completed?: Partial<Record<OnboardingStepId, boolean>>;
}

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  "dashboard",
  "import",
  "transactions",
  "plans",
];

export function readOnboardingProgress(settings: ProfileSettings | undefined): OnboardingProgress {
  const raw = settings?.onboarding;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as OnboardingProgress;
}

export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  if (progress.dismissed) return true;
  const completed = progress.completed ?? {};
  return ONBOARDING_STEPS.every((id) => completed[id]);
}

export function buildOnboardingSteps(progress: OnboardingProgress): OnboardingStep[] {
  const completed = progress.completed ?? {};
  return ONBOARDING_STEPS.map((id) => ({ id, done: !!completed[id] }));
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
}): OnboardingProgress {
  const completed = { ...input.progress.completed };
  if (input.visitedDashboard) completed.dashboard = true;
  if (input.hasCommittedImport) completed.import = true;
  if (input.transactionCount > 0) completed.transactions = true;
  if (input.hasPlanOrNetWorth) completed.plans = true;
  return { ...input.progress, completed };
}
