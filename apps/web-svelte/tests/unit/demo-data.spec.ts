import { describe, expect, it } from "vitest";
import {
  canSeedDemo,
  hasDemoData,
  isDemoDescription,
  isDemoPlanName,
  isDiscoveryLedger,
} from "$lib/services/demo-data-guards";

describe("demo-data guards", () => {
  it("detects demo-prefixed rows", () => {
    expect(isDemoDescription("Demo: Zakupy")).toBe(true);
    expect(isDemoDescription("Zakupy")).toBe(false);
    expect(isDemoPlanName("Demo: Cel")).toBe(true);
  });

  it("allows seed when demo is not active", () => {
    expect(canSeedDemo({ demoActive: false })).toBe(true);
    expect(canSeedDemo({ demoActive: true })).toBe(false);
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
        transactions: [{ description: "Pensja", is_demo: true }],
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

  it("detects demo net worth items even when txs and plans are gone", () => {
    expect(
      hasDemoData({
        transactions: [],
        plans: [],
        netWorthItems: [{ label: "Demo: Mieszkanie (nieruchomość)" }],
      })
    ).toBe(true);
    expect(
      hasDemoData({
        transactions: [],
        plans: [],
        netWorthItems: [{ label: "Mieszkanie" }],
      })
    ).toBe(false);
  });

  it("treats an empty non-demo ledger as discovery", () => {
    expect(isDiscoveryLedger({ demoActive: false, transactionCount: 0 })).toBe(true);
  });

  it("leaves discovery once any committed transaction exists", () => {
    expect(isDiscoveryLedger({ demoActive: false, transactionCount: 1 })).toBe(false);
  });

  it("leaves discovery while demo data is active even with zero transactions", () => {
    expect(isDiscoveryLedger({ demoActive: true, transactionCount: 0 })).toBe(false);
  });
});
