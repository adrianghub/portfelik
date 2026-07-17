import { describe, expect, it } from "vitest";
import {
  activeUsersPhrase,
  buildSummaryBody,
  buildSummaryNotificationData,
  transactionsPhrase,
} from "../../../../supabase/functions/send-admin-summary/summary-copy";

describe("weekly summary notification copy", () => {
  it("uses singular for one active user", () => {
    expect(activeUsersPhrase(1)).toBe("1 aktywna osoba");
    expect(buildSummaryBody(3, 1)).toBe("Ostatnie 7 dni: 3 transakcje - 1 aktywna osoba.");
  });

  it("uses few plural for 2-4 users", () => {
    expect(activeUsersPhrase(2)).toBe("2 aktywne osoby");
    expect(activeUsersPhrase(4)).toBe("4 aktywne osoby");
  });

  it("uses many plural for 5+ users", () => {
    expect(activeUsersPhrase(5)).toBe("5 aktywnych osób");
    expect(activeUsersPhrase(22)).toBe("22 aktywne osoby");
  });

  it("handles zero active users", () => {
    expect(activeUsersPhrase(0)).toBe("Na razie nikt nie dodał transakcji");
  });

  it("uses Polish transaction plurals", () => {
    expect(transactionsPhrase(1)).toBe("1 transakcja");
    expect(transactionsPhrase(2)).toBe("2 transakcje");
    expect(transactionsPhrase(12)).toBe("12 transakcji");
    expect(transactionsPhrase(22)).toBe("22 transakcje");
  });

  it("does not include financial amounts in the notification body or data", () => {
    const body = buildSummaryBody(12, 2);
    const data = buildSummaryNotificationData({
      windowStart: "2026-07-06T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
      userCount: 2,
      txCount: 12,
      schedule: "monday",
    });

    expect(body).not.toMatch(/PLN|zł|wpływ|wydatk/i);
    expect(Object.keys(data).sort()).toEqual([
      "schedule",
      "txCount",
      "userCount",
      "windowEnd",
      "windowStart",
    ]);
    expect(JSON.stringify(data)).not.toMatch(/amount|income|expense|perUser/i);
  });
});
