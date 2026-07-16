import { describe, expect, it } from "vitest";

import { canConvertAllToPln, convertToPln, type FxRates } from "$lib/services/fx";

const rates: FxRates = { PLN: 1, EUR: 4.3, USD: 4.0 };

describe("convertToPln", () => {
  it("returns PLN amounts unchanged", () => {
    expect(convertToPln(100, "PLN", rates)).toBe(100);
  });

  it("multiplies foreign amounts by the rate", () => {
    expect(convertToPln(100, "EUR", rates)).toBeCloseTo(430);
    expect(convertToPln(50, "USD", rates)).toBeCloseTo(200);
  });

  it("returns null when the rate is missing", () => {
    expect(convertToPln(100, "JPY", rates)).toBeNull();
  });
});

describe("canConvertAllToPln", () => {
  it("is false without rates", () => {
    expect(canConvertAllToPln([{ currency: "EUR" }], null)).toBe(false);
  });

  it("allows PLN-only bags without foreign rates present", () => {
    expect(canConvertAllToPln([{ currency: "PLN" }], { PLN: 1 })).toBe(true);
  });

  it("rejects any item whose currency lacks a rate", () => {
    expect(canConvertAllToPln([{ currency: "EUR" }, { currency: "JPY" }], rates)).toBe(false);
  });
});
