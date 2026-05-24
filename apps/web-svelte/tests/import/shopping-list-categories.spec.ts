import { describe, expect, it } from "vitest";
import {
  compareShoppingListCategoryGroups,
  inferShoppingListCategory,
  isShoppingListCategoryGroupDone,
  normalizeShoppingListCategory,
  SHOPPING_LIST_CATEGORY_FALLBACK,
} from "$lib/shopping-list-categories";

describe("shopping-list item categories", () => {
  it("normalizes empty and fallback category names to null", () => {
    expect(normalizeShoppingListCategory(null)).toBeNull();
    expect(normalizeShoppingListCategory("   ")).toBeNull();
    expect(normalizeShoppingListCategory(SHOPPING_LIST_CATEGORY_FALLBACK)).toBeNull();
    expect(normalizeShoppingListCategory("  Warzywa  ")).toBe("Warzywa");
  });

  it("infers a category from common Polish item names", () => {
    expect(inferShoppingListCategory("pomidory malinowe")).toBe("Warzywa");
    expect(inferShoppingListCategory("mleko 2%")).toBe("Nabiał");
    expect(inferShoppingListCategory("papier do kuchni")).toBe("Chemia do domu");
    expect(inferShoppingListCategory("nietypowy produkt")).toBeNull();
  });

  it("marks only non-empty fully completed groups as done", () => {
    expect(isShoppingListCategoryGroupDone({ category: "Warzywa", completed: 2, total: 2 })).toBe(
      true
    );
    expect(isShoppingListCategoryGroupDone({ category: "Warzywa", completed: 1, total: 2 })).toBe(
      false
    );
    expect(isShoppingListCategoryGroupDone({ category: "Warzywa", completed: 0, total: 0 })).toBe(
      false
    );
  });

  it("sorts active groups above completed groups and keeps fallback last", () => {
    const groups = [
      { category: "Inne", completed: 0, total: 1 },
      { category: "Warzywa", completed: 3, total: 3, orderIndex: 0 },
      { category: "Nabiał", completed: 0, total: 2, orderIndex: 1 },
      { category: "Owoce", completed: 1, total: 2, orderIndex: 2 },
    ].sort(compareShoppingListCategoryGroups);

    expect(groups.map((group) => group.category)).toEqual(["Nabiał", "Owoce", "Inne", "Warzywa"]);
  });
});
