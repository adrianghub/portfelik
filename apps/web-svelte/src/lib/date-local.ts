/** Format a Date as the user's local calendar day, without a UTC conversion. */
export function localDateIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const PRODUCT_TIME_ZONE = "Europe/Warsaw";

/**
 * Resolve a persisted timestamp to the product's canonical Warsaw calendar day.
 * Bare database `date` values are already calendar days and must not be shifted.
 */
export function productDateIso(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new RangeError("Could not resolve product calendar date");
  return `${year}-${month}-${day}`;
}

/** Add calendar days to a YYYY-MM-DD local date string. */
export function addLocalDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return localDateIso(new Date(y, m - 1, d + days));
}
