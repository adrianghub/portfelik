import { describe, expect, it } from "vitest";

/** Mirrors supabase/functions/send-admin-summary/index.ts copy helpers. */
function activeUsersPhrase(count: number): string {
  if (count === 0) return "Na razie nikt nie dodał transakcji";
  if (count === 1) return "1 aktywna osoba";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return `${count} aktywne osoby`;
  }
  return `${count} aktywnych osób`;
}

function buildSummaryBody(income: number, expense: number, userCount: number): string {
  const users = activeUsersPhrase(userCount);
  return `Ostatnie 7 dni: wpływy ${income.toFixed(2)} PLN, wydatki ${expense.toFixed(2)} PLN - ${users}.`;
}

describe("weekly summary notification copy", () => {
  it("uses singular for one active user", () => {
    expect(activeUsersPhrase(1)).toBe("1 aktywna osoba");
    expect(buildSummaryBody(2797.37, 3169.7, 1)).toContain("1 aktywna osoba");
    expect(buildSummaryBody(2797.37, 3169.7, 1)).not.toContain("użytkowników");
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
});
