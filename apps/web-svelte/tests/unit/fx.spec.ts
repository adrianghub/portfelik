import { describe, expect, it } from "vitest";

import { convertToPln, type FxRates } from "$lib/services/fx";

const rates: FxRates = { PLN: 1, EUR: 4.3, USD: 4.0 };

describe("convertToPln", () => {
  it("returns PLN amounts unchanged", () => {
    expect(convertToPln(100, "PLN", rates)).toBe(100);
  });

  it("multiplies foreign amounts by the rate", () => {
    expect(convertToPln(100, "EUR", rates)).toBeCloseTo(430);
    expect(convertToPln(50, "USD", rates)).toBeCloseTo(200);
  });

  it("falls back to the raw amount when the rate is missing", () => {
    expect(convertToPln(100, "JPY", rates)).toBe(100);
  });
});
