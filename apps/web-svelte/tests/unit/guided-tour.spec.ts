import { describe, expect, it } from "vitest";
import {
  TOUR_SCENES,
  advanceGuidedTour,
  completeGuidedTour,
  dismissGuidedTour,
  firstIncompleteSceneIndex,
  guidedTourStatus,
  isGuidedTourComplete,
  mergeGuidedTourProgress,
  routesMatch,
  sceneRouteParts,
  shouldOfferWelcomeTour,
} from "$lib/services/guided-tour";

describe("guided-tour", () => {
  it("sceneRouteParts splits pathname and search", () => {
    expect(sceneRouteParts("/settings?tab=profile")).toEqual({
      pathname: "/settings",
      search: "?tab=profile",
    });
    expect(sceneRouteParts("/dashboard")).toEqual({
      pathname: "/dashboard",
      search: "",
    });
  });

  it("routesMatch compares search params on scene routes", () => {
    expect(routesMatch("/settings", "?tab=profile", "/settings?tab=profile")).toBe(true);
    expect(routesMatch("/settings", "?tab=groups", "/settings?tab=profile")).toBe(false);
    expect(routesMatch("/dashboard", "", "/dashboard")).toBe(true);
  });

  it("advanceGuidedTour accumulates completed scene ids", () => {
    const next = advanceGuidedTour({}, "1.1");
    expect(next.completedSceneIds).toEqual(["1.1"]);
    const again = advanceGuidedTour(next, "1.2");
    expect(again.completedSceneIds).toEqual(["1.1", "1.2"]);
  });

  it("isGuidedTourComplete when every scene is done", () => {
    const done = completeGuidedTour({});
    expect(isGuidedTourComplete(done)).toBe(true);
    expect(isGuidedTourComplete(dismissGuidedTour({}))).toBe(true);
    expect(isGuidedTourComplete({})).toBe(false);
  });

  it("firstIncompleteSceneIndex skips completed scenes", () => {
    const progress = mergeGuidedTourProgress({}, { completedSceneIds: ["1.1", "1.2"] });
    expect(firstIncompleteSceneIndex(progress)).toBe(2);
    expect(TOUR_SCENES[2]?.id).toBe("1.3");
  });

  it("shouldOfferWelcomeTour stays true when legacy onboarding was completed", () => {
    expect(
      shouldOfferWelcomeTour({
        onboarding: {
          dismissed: true,
          completed: { dashboard: true, import: true, transactions: true, plans: true },
        },
      })
    ).toBe(true);
  });

  it("shouldOfferWelcomeTour is false when profile tour was dismissed", () => {
    expect(shouldOfferWelcomeTour({ guidedTour: { dismissed: true } })).toBe(false);
  });

  it("guidedTourStatus reflects progress phase", () => {
    expect(guidedTourStatus(undefined)).toBe("not_started");
    expect(guidedTourStatus({ guidedTour: { completedSceneIds: ["1.1"] } as never })).toBe(
      "in_progress"
    );
    expect(guidedTourStatus({ guidedTour: completeGuidedTour({}) as never })).toBe("completed");
    expect(guidedTourStatus({ guidedTour: dismissGuidedTour({}) as never })).toBe("dismissed");
  });
});
