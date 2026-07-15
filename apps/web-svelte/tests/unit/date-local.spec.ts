import { describe, expect, it } from "vitest";
import { localDateIso } from "$lib/date-local";

describe("localDateIso", () => {
  it("formats the local calendar date without converting through UTC", () => {
    expect(localDateIso(new Date(2026, 6, 14, 0, 30))).toBe("2026-07-14");
  });

  it("pads single-digit months and days", () => {
    expect(localDateIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
