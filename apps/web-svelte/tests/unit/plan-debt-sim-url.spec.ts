import { describe, expect, it } from "vitest";
import { parseDebtSimUrl, scenariosHref } from "$lib/utils/plan-debt-sim-url";

describe("parseDebtSimUrl", () => {
  it("parses debt simulation query params with defaults", () => {
    expect(parseDebtSimUrl(new URLSearchParams())).toEqual({
      mode: "monthly",
      extra: 500,
      amount: 10_000,
      invest: 7,
    });
  });

  it("rounds invest to half-point steps", () => {
    expect(parseDebtSimUrl(new URLSearchParams("invest=6.3")).invest).toBe(6.5);
  });

  it("builds scenarios href preserving state", () => {
    expect(
      scenariosHref("plan-1", {
        mode: "lump",
        extra: 1000,
        amount: 20_000,
        invest: 8,
      })
    ).toBe("/plans/plan-1/scenarios?mode=lump&extra=1000&amount=20000&invest=8");
  });
});
