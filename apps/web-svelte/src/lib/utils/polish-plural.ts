export type PolishPluralForm = "one" | "few" | "many";

/** Polish count plural: 1 / 2–4 (except 12–14) / 5+ and teens. */
export function polishPluralForm(count: number): PolishPluralForm {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return "one";
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "few";
  return "many";
}
