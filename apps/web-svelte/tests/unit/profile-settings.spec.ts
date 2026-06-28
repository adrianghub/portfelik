import { describe, expect, it } from "vitest";
import { getBankImportReminder, normalizeImportReminderCadence } from "$lib/profile-settings";

describe("profile-settings", () => {
  it("normalizes cadence from json numbers and strings", () => {
    expect(normalizeImportReminderCadence(7)).toBe(7);
    expect(normalizeImportReminderCadence("14")).toBe(14);
    expect(normalizeImportReminderCadence("30")).toBe(30);
    expect(normalizeImportReminderCadence(null)).toBe(7);
    expect(normalizeImportReminderCadence(99)).toBe(7);
  });

  it("reads bank import reminder from profile settings", () => {
    expect(
      getBankImportReminder({
        alerts: { bankImportReminder: { enabled: true, cadenceDays: "14" as unknown as 14 } },
      })
    ).toEqual({ enabled: true, cadenceDays: 14 });
  });
});
