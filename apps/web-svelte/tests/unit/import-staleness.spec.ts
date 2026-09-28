import { describe, expect, it } from "vitest";
import { isCommittedImportStale } from "$lib/services/import-staleness";

describe("isCommittedImportStale", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("is false when the reminder is off", () => {
    expect(
      isCommittedImportStale({
        enabled: false,
        committedAt: "2026-09-01T00:00:00Z",
        cadenceDays: 14,
        now,
      })
    ).toBe(false);
  });

  it("is false when nothing has been committed", () => {
    expect(
      isCommittedImportStale({
        enabled: true,
        committedAt: null,
        cadenceDays: 14,
        now,
      })
    ).toBe(false);
  });

  it("is false on the day before the cadence", () => {
    expect(
      isCommittedImportStale({
        enabled: true,
        committedAt: "2026-09-15T12:00:00Z",
        cadenceDays: 14,
        now,
      })
    ).toBe(false);
  });

  it("is true when the age reaches the cadence", () => {
    expect(
      isCommittedImportStale({
        enabled: true,
        committedAt: "2026-09-14T12:00:00Z",
        cadenceDays: 14,
        now,
      })
    ).toBe(true);
  });
});
