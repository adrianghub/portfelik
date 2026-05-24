export const DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES = [
  "Warzywa",
  "Owoce",
  "Pieczywo",
  "Nabiał",
  "Mięso",
  "Mrożonki",
  "Napoje",
  "Przyprawy",
  "Sosy",
  "Przekąski",
  "Słodycze",
  "Przybory kuchenne",
  "Przybory toaletowe",
  "Kosmetyki",
  "Chemia do domu",
  "Przybory do sprzątania",
  "Przybory biurowe",
].filter((name, index, all) => all.indexOf(name) === index);

export const SHOPPING_LIST_CATEGORY_FALLBACK = "Inne";

export function normalizeShoppingListCategory(category: string | null | undefined): string | null {
  if (category == null) return null;
  const trimmed = category.trim();
  if (!trimmed || trimmed === SHOPPING_LIST_CATEGORY_FALLBACK) return null;
  return trimmed;
}

const PRESET_INDEX: Record<string, number> = Object.fromEntries(
  DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES.map((name, i) => [name, i])
);

export function categoryOrderKey(category: string): [number, string] {
  if (category === SHOPPING_LIST_CATEGORY_FALLBACK) return [2, category];
  const presetIdx = PRESET_INDEX[category];
  if (presetIdx !== undefined) return [0, String(presetIdx).padStart(3, "0")];
  return [1, category.toLocaleLowerCase("pl")];
}

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  {
    category: "Warzywa",
    keywords: [
      "pomidor",
      "ogórek",
      "marchew",
      "cebula",
      "ziemniak",
      "papryka",
      "sałata",
      "brokuł",
      "cukinia",
      "czosnek",
    ],
  },
  {
    category: "Owoce",
    keywords: ["jabł", "banan", "gruszk", "cytryn", "pomarań", "winogron", "truskawk", "malin"],
  },
  {
    category: "Pieczywo",
    keywords: ["chleb", "buł", "bagiet", "tost", "kajzer", "rogal"],
  },
  {
    category: "Nabiał",
    keywords: ["mleko", "jogurt", "ser", "twaróg", "śmietan", "masło", "kefir"],
  },
  {
    category: "Mięso",
    keywords: ["kurcz", "wołow", "wieprz", "indyk", "szynk", "kiełbas", "mięso"],
  },
  {
    category: "Mrożonki",
    keywords: ["mroż", "lody", "frytki"],
  },
  {
    category: "Napoje",
    keywords: ["woda", "sok", "cola", "napój", "kawa", "herbata"],
  },
  {
    category: "Przyprawy",
    keywords: ["sól", "pieprz", "papryka słodka", "oregano", "bazylia", "cynamon"],
  },
  {
    category: "Sosy",
    keywords: ["sos", "ketchup", "majonez", "musztard"],
  },
  {
    category: "Przekąski",
    keywords: ["chips", "orzesz", "palusz", "krakers"],
  },
  {
    category: "Słodycze",
    keywords: ["czekolad", "baton", "ciastk", "cukierk"],
  },
  {
    category: "Chemia do domu",
    keywords: ["papier", "płyn", "proszek", "kapsułki", "tabletki", "ścierecz"],
  },
  {
    category: "Kosmetyki",
    keywords: ["szampon", "mydło", "żel", "pasta", "dezodorant", "krem"],
  },
];

export function inferShoppingListCategory(name: string): string | null {
  const q = name.trim().toLocaleLowerCase("pl");
  if (!q) return null;
  return (
    CATEGORY_KEYWORDS.find((entry) => entry.keywords.some((keyword) => q.includes(keyword)))
      ?.category ?? null
  );
}

export function compareShoppingListCategories(a: string, b: string): number {
  const [rankA, keyA] = categoryOrderKey(a);
  const [rankB, keyB] = categoryOrderKey(b);
  if (rankA !== rankB) return rankA - rankB;
  return keyA.localeCompare(keyB, "pl", { sensitivity: "base" });
}

export interface ShoppingListCategoryGroupSummary {
  category: string;
  completed: number;
  total: number;
  orderIndex?: number;
}

export function isShoppingListCategoryGroupDone(group: ShoppingListCategoryGroupSummary): boolean {
  return group.total > 0 && group.completed === group.total;
}

export function compareShoppingListCategoryGroups(
  a: ShoppingListCategoryGroupSummary,
  b: ShoppingListCategoryGroupSummary
): number {
  const doneA = isShoppingListCategoryGroupDone(a);
  const doneB = isShoppingListCategoryGroupDone(b);
  if (doneA !== doneB) return doneA ? 1 : -1;

  if (a.category === SHOPPING_LIST_CATEGORY_FALLBACK) return 1;
  if (b.category === SHOPPING_LIST_CATEGORY_FALLBACK) return -1;

  if (a.orderIndex !== undefined && b.orderIndex !== undefined) return a.orderIndex - b.orderIndex;
  if (a.orderIndex !== undefined) return -1;
  if (b.orderIndex !== undefined) return 1;

  return compareShoppingListCategories(a.category, b.category);
}
