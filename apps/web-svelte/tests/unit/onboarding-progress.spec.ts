import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  deriveOnboardingFromSignals,
  isCoreOnboardingComplete,
  onboardingCompletionDelta,
} from "$lib/services/onboarding-progress";

describe("onboarding-progress", () => {
  it("marks core complete when required steps are done", () => {
    const progress = deriveOnboardingFromSignals({
      progress: {},
      visitedDashboard: true,
      hasCommittedImport: true,
      transactionCount: 5,
      hasPlanOrNetWorth: true,
      importReminderEnabled: false,
    });
    expect(isCoreOnboardingComplete(progress)).toBe(true);
    expect(
      buildOnboardingSteps(progress)
        .filter((s) => !s.optional)
        .every((s) => s.done)
    ).toBe(true);
  });

  it("keeps reminders optional for core completion", () => {
    const progress = deriveOnboardingFromSignals({
      progress: {},
      visitedDashboard: true,
      hasCommittedImport: true,
      transactionCount: 2,
      hasPlanOrNetWorth: true,
      importReminderEnabled: false,
    });
    expect(isCoreOnboardingComplete(progress)).toBe(true);
    const reminders = buildOnboardingSteps(progress).find((s) => s.id === "reminders");
    expect(reminders?.done).toBe(false);
  });

  it("returns completion delta only for newly finished steps", () => {
    const stored = { completed: { dashboard: true } };
    const derived = deriveOnboardingFromSignals({
      progress: stored,
      visitedDashboard: true,
      hasCommittedImport: true,
      transactionCount: 0,
      hasPlanOrNetWorth: false,
    });
    expect(onboardingCompletionDelta(stored, derived)).toEqual({ import: true });
  });
});
