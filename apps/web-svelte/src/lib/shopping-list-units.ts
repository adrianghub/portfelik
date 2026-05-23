export const DEFAULT_SHOPPING_LIST_UNIT = "szt.";

export const SHOPPING_LIST_UNIT_OPTIONS = ["szt.", "kg", "opak.", "l"] as const;

export function normalizeShoppingListUnit(unit: string) {
  const trimmed = unit.trim();
  return trimmed || DEFAULT_SHOPPING_LIST_UNIT;
}
