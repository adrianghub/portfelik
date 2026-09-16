import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyGreeting } from "$lib/dashboard-daily";

const greetings = ["Cześć", "Hej", "Witaj", "Dzień dobry"];

function setLocalTime(year: number, month: number, day: number, hour = 12) {
  vi.setSystemTime(new Date(year, month - 1, day, hour, 0, 0, 0));
}

function localDayIndex(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 86_400_000);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard daily rotation", () => {
  it("returns a known greeting", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24);

    expect(greetings).toContain(dailyGreeting());
    expect(dailyGreeting()).not.toHaveLength(0);
  });

  it("is deterministic within the same local day", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24, 8);
    const morningGreeting = dailyGreeting();

    setLocalTime(2026, 5, 24, 23);

    expect(dailyGreeting()).toBe(morningGreeting);
  });

  it("rotates across consecutive local days", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24);
    const firstGreeting = dailyGreeting();

    setLocalTime(2026, 5, 25);

    expect(dailyGreeting()).not.toBe(firstGreeting);
  });

  it("indexes greeting from the local day", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24);
    const index = localDayIndex();

    expect(dailyGreeting()).toBe(greetings[index % greetings.length]);
  });
});
