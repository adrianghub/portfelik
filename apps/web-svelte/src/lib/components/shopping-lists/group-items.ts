import {
  SHOPPING_LIST_CATEGORY_FALLBACK,
  compareShoppingListCategoryGroups,
  isShoppingListCategoryGroupDone,
} from "$lib/shopping-list-categories";
import type { ShoppingItemCategory, ShoppingListItem } from "$lib/types";

export interface GroupedItems {
  category: string;
  items: ShoppingListItem[];
  completed: number;
  done: boolean;
}

export function groupShoppingListItems(
  items: ShoppingListItem[],
  options: {
    search?: string;
    draftCategories?: ReadonlySet<string>;
    knownCategories?: ShoppingItemCategory[];
    sortItems?: boolean;
  } = {}
): GroupedItems[] {
  const { search = "", draftCategories, knownCategories, sortItems = true } = options;

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    const base = sortItems
      ? [...items].sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return a.position - b.position;
        })
      : items;
    return q ? base.filter((i) => i.name.toLowerCase().includes(q)) : base;
  })();

  const map = new Map<string, ShoppingListItem[]>();
  for (const item of filtered) {
    const category = item.category?.trim() || SHOPPING_LIST_CATEGORY_FALLBACK;
    map.set(category, [...(map.get(category) ?? []), item]);
  }
  if (!search.trim() && draftCategories) {
    for (const category of draftCategories) {
      if (!map.has(category)) map.set(category, []);
    }
  }

  const order = new Map((knownCategories ?? []).map((category, i) => [category.name, i]));

  return Array.from(map.entries())
    .sort(([a, itemsA], [b, itemsB]) =>
      compareShoppingListCategoryGroups(
        {
          category: a,
          completed: itemsA.filter((i) => i.completed).length,
          total: itemsA.length,
          orderIndex: order.get(a),
        },
        {
          category: b,
          completed: itemsB.filter((i) => i.completed).length,
          total: itemsB.length,
          orderIndex: order.get(b),
        }
      )
    )
    .map(([category, list]) => {
      const completed = list.filter((i) => i.completed).length;
      return {
        category,
        items: list,
        completed,
        done: isShoppingListCategoryGroupDone({
          category: "",
          completed,
          total: list.length,
        }),
      };
    });
}

export function itemCategoryName(item: ShoppingListItem): string {
  return item.category?.trim() || SHOPPING_LIST_CATEGORY_FALLBACK;
}
