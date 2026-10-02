/** Non-negative PLN-style decimal input. Return null rather than guessing at invalid text. */
export function parseMoneyInput(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount <= 9999999999.99 ? amount : null;
}
