import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  deriveOnboardingFromSignals,
  isOnboardingComplete,
} from "$lib/services/onboarding-progress";

describe("onboarding-progress", () => {
  it("marks complete when all steps are done", () => {
    const progress = deriveOnboardingFromSignals({
      progress: {},
      visitedDashboard: true,
      hasCommittedImport: true,
      transactionCount: 5,
      hasPlanOrNetWorth: true,
    });
    expect(isOnboardingComplete(progress)).toBe(true);
    expect(buildOnboardingSteps(progress).every((s) => s.done)).toBe(true);
  });
});
