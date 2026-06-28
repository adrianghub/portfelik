import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachmarkStorageKey,
  dismissCoachmark,
  isCoachmarkDismissed,
} from "$lib/services/coachmarks";

describe("coachmarks", () => {
  const lsData: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => lsData[key] ?? null,
      setItem: (key: string, value: string) => {
        lsData[key] = value;
      },
      clear: () => {
        for (const key of Object.keys(lsData)) delete lsData[key];
      },
    });
    for (const key of Object.keys(lsData)) delete lsData[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses prefixed storage keys", () => {
    expect(coachmarkStorageKey("plans_hub")).toBe("coachmark:plans_hub");
  });

  it("dismisses and reads back", () => {
    expect(isCoachmarkDismissed("plans_hub")).toBe(false);
    dismissCoachmark("plans_hub");
    expect(isCoachmarkDismissed("plans_hub")).toBe(true);
  });

  it("reads legacy plans hub key", () => {
    lsData["plans-hub-onboarding"] = "1";
    expect(isCoachmarkDismissed("plans_hub")).toBe(true);
  });
});
