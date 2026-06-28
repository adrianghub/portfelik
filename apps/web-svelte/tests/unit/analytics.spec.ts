import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lsData: Record<string, string> = {};

describe("analytics", () => {
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
    vi.resetModules();
  });

  it("track does not throw in node (browser stub)", async () => {
    const { track } = await import("$lib/analytics");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() => track("demo_loaded", { row_count: 3 })).not.toThrow();
    spy.mockRestore();
  });

  it("trackOnce dedupes via localStorage", async () => {
    const { trackOnce } = await import("$lib/analytics");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    trackOnce("onboarding_started", { step_count: 4 });
    trackOnce("onboarding_started", { step_count: 4 });
    expect(lsData["analytics:onboarding_started"]).toBe("1");
    spy.mockRestore();
  });
});
