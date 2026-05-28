import { describe, expect, it, vi } from "vitest";
import { deriveShoppingListBucket, deriveShoppingListMode } from "$lib/services/shopping-lists";
import type { ShoppingList } from "$lib/types";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

function list(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: "list-1",
    name: "Zakupy",
    status: "active",
    user_id: "user-1",
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    planned_for: "2026-05-28",
    shopping_started_at: null,
    created_at: "2026-05-28T08:00:00Z",
    updated_at: "2026-05-28T08:00:00Z",
    ...overrides,
  };
}

describe("shopping list mode derivation", () => {
  it("keeps planning as the default active detail mode", () => {
    expect(deriveShoppingListMode(list())).toBe("planning");
  });

  it("uses explicit start-shopping intent for shopping mode", () => {
    expect(deriveShoppingListMode(list({ shopping_started_at: "2026-05-28T12:00:00Z" }))).toBe(
      "shopping"
    );
  });

  it("completed lists are done even if shopping_started_at is still set", () => {
    expect(
      deriveShoppingListMode(
        list({
          completed_at: "2026-05-28T14:00:00Z",
          shopping_started_at: "2026-05-28T12:00:00Z",
        })
      )
    ).toBe("done");
  });
});

describe("shopping list bucket derivation", () => {
  it("puts future planning lists into upcoming", () => {
    expect(deriveShoppingListBucket(list({ planned_for: "2026-05-30" }), "2026-05-28")).toBe(
      "upcoming"
    );
  });

  it("keeps started future lists active as an escape hatch", () => {
    expect(
      deriveShoppingListBucket(
        list({ planned_for: "2026-05-30", shopping_started_at: "2026-05-28T12:00:00Z" }),
        "2026-05-28"
      )
    ).toBe("active");
  });

  it("archives completed lists", () => {
    expect(
      deriveShoppingListBucket(list({ completed_at: "2026-05-28T14:00:00Z" }), "2026-05-28")
    ).toBe("archived");
  });
});
