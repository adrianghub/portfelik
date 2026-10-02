import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "$lib/money-input";

describe("Polish amount input", () => {
  it("accepts comma decimals, grouped amounts and numeric bindings", () => {
    expect(parseMoneyInput("2 635,81")).toBe(2635.81);
    expect(parseMoneyInput("2\u00a0000,50")).toBe(2000.5);
    expect(parseMoneyInput(35.5)).toBe(35.5);
    expect(parseMoneyInput("0")).toBe(0);
  });
  it("rejects empty, negative, non-finite, over-precision and oversized amounts", () => {
    for (const value of [
      "",
      null,
      undefined,
      "-35",
      "1,234",
      "1e3",
      Infinity,
      "10000000000",
      "35 zł",
    ])
      expect(parseMoneyInput(value)).toBeNull();
  });
});
