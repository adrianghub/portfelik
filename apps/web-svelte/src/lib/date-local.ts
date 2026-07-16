/** Format a Date as the user's local calendar day, without a UTC conversion. */
export function localDateIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Add calendar days to a YYYY-MM-DD local date string. */
export function addLocalDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return localDateIso(new Date(y, m - 1, d + days));
}
