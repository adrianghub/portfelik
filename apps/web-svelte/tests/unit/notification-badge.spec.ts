import { describe, expect, it } from "vitest";
import { notificationBadgeLabel } from "$lib/notifications/badge";

describe("notification badge", () => {
  it("hides zero, keeps 9, and caps at 99+", () => {
    expect(notificationBadgeLabel(0)).toBeNull();
    expect(notificationBadgeLabel(9)).toBe("9");
    expect(notificationBadgeLabel(99)).toBe("99");
    expect(notificationBadgeLabel(100)).toBe("99+");
  });
});
