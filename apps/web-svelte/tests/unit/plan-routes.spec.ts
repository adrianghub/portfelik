import { describe, expect, it } from "vitest";
import { planDetailHref, planSettleHref } from "$lib/utils/plan-routes";

describe("plan-routes", () => {
  it("preserves query string on plan stack hrefs", () => {
    const params = new URLSearchParams("mode=monthly&extra=500&invest=7");
    expect(planDetailHref("p1", params)).toBe("/plans/p1?mode=monthly&extra=500&invest=7");
    expect(planSettleHref("p1", params)).toBe("/plans/p1/settle?mode=monthly&extra=500&invest=7");
  });

  it("omits query when empty", () => {
    expect(planDetailHref("p1", new URLSearchParams())).toBe("/plans/p1");
  });
});
