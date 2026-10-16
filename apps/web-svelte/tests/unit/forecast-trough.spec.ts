import { describe, expect, it } from "vitest";
import { forecastTrough } from "$lib/services/forecast-trough";

describe("forecastTrough", () => {
  it("returns null for an empty series", () => {
    expect(forecastTrough([])).toBeNull();
  });

  it("picks the earliest lowest balance", () => {
    expect(
      forecastTrough([
        { date: "2026-10-01", balance: 1000 },
        { date: "2026-10-05", balance: 200 },
        { date: "2026-10-08", balance: 200 },
        { date: "2026-10-10", balance: 500 },
      ])
    ).toEqual({ date: "2026-10-05", balance: 200 });
  });
});
