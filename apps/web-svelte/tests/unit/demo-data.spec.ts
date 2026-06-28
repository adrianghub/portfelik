import { describe, expect, it } from "vitest";
import {
  canSeedDemo,
  hasDemoData,
  isDemoDescription,
  isDemoPlanName,
} from "$lib/services/demo-data-guards";

describe("demo-data guards", () => {
  it("detects demo-prefixed rows", () => {
    expect(isDemoDescription("Demo: Zakupy")).toBe(true);
    expect(isDemoDescription("Zakupy")).toBe(false);
    expect(isDemoPlanName("Demo: Cel")).toBe(true);
  });

  it("allows seed only on an empty ledger", () => {
    expect(canSeedDemo(0)).toBe(true);
    expect(canSeedDemo(3)).toBe(false);
  });

  it("detects active demo data", () => {
    expect(
      hasDemoData({
        transactions: [{ description: "Demo: Pensja" }],
        plans: [],
      })
    ).toBe(true);
    expect(
      hasDemoData({
        transactions: [],
        plans: [{ name: "Demo: Cel" }],
      })
    ).toBe(true);
  });
});
