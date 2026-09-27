/**
 * Daily rotating greeting for the dashboard.
 *
 * Seeded by the current local day so the value stays stable within a day
 * and rotates at local midnight. No API calls: a fixed array keeps the
 * dashboard render synchronous and offline-friendly.
 */

const greetings: string[] = ["Cześć", "Hej", "Witaj", "Dzień dobry"];

function dayIndex(): number {
  // Local-day count: epoch days adjusted so the rotation flips at LOCAL
  // midnight rather than UTC midnight (Warsaw is UTC+1/+2, so UTC days
  // change in the middle of evening here).
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 86_400_000);
}

export function dailyGreeting(): string {
  return greetings[dayIndex() % greetings.length] ?? greetings[0];
}
