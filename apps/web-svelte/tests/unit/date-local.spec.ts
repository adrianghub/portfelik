import { describe, expect, it } from "vitest";
import { addLocalDays, localDateIso, productDateIso } from "$lib/date-local";

describe("localDateIso", () => {
  it("formats the local calendar date without converting through UTC", () => {
    expect(localDateIso(new Date(2026, 6, 14, 0, 30))).toBe("2026-07-14");
  });

  it("pads single-digit months and days", () => {
    expect(localDateIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("productDateIso", () => {
  it("keeps a bare calendar date unchanged", () => {
    expect(productDateIso("2026-06-12")).toBe("2026-06-12");
  });

  it("uses Europe/Warsaw at the UTC day boundary in summer and winter", () => {
    expect(productDateIso("2026-06-12T21:59:59Z")).toBe("2026-06-12");
    expect(productDateIso("2026-06-12T22:00:00Z")).toBe("2026-06-13");
    expect(productDateIso("2026-12-31T23:00:00Z")).toBe("2027-01-01");
  });
});

describe("addLocalDays", () => {
  it("advances calendar days across Warsaw DST changes", () => {
    expect(addLocalDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addLocalDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});
