import { describe, expect, it } from "vitest";
import {
  DEMO_BANNER_ACTIONS,
  DEMO_WALKTHROUGH_ACTIONS,
  ONBOARDING_CHAPTER_ORDER,
  ONBOARDING_SCENES,
  demoWalkthroughActionsVisible,
  tourSceneBody,
  tourSceneMessageKey,
  validateOnboardingManifest,
} from "$lib/content/onboarding";
import { TOUR_CHAPTERS, TOUR_SCENES } from "$lib/services/guided-tour";

describe("onboarding manifest", () => {
  it("passes structural validation", () => {
    expect(validateOnboardingManifest()).toEqual([]);
  });

  it("re-exports scenes and chapters into guided-tour", () => {
    expect(TOUR_SCENES).toEqual(ONBOARDING_SCENES);
    expect(TOUR_CHAPTERS).toEqual(ONBOARDING_CHAPTER_ORDER);
  });

  it("maps every scene id to copy and pl.json key convention", () => {
    for (const scene of ONBOARDING_SCENES) {
      expect(tourSceneMessageKey(scene.id)).toBe(`tour_scene_${scene.id.replace(".", "_")}`);
      expect(tourSceneBody(scene.id).length).toBeGreaterThan(0);
    }
  });

  it("filters walkthrough actions by demo state", () => {
    expect(demoWalkthroughActionsVisible({ demoActive: true }).map((a) => a.id)).toEqual([
      "clear",
      "restart_tour",
    ]);
    expect(demoWalkthroughActionsVisible({ demoActive: false }).map((a) => a.id)).toEqual([
      "load",
      "load_and_tour",
      "restart_tour",
    ]);
  });

  it("defines banner and panel action order", () => {
    expect(DEMO_WALKTHROUGH_ACTIONS.length).toBeGreaterThan(0);
    expect(DEMO_BANNER_ACTIONS.length).toBeGreaterThan(0);
  });
});
