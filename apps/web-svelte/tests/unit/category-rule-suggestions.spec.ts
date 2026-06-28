import { describe, expect, it } from "vitest";
import { detectCategoryRuleSuggestions } from "$lib/import/category-rule-suggestions";
import type { Category } from "$lib/types";

const inneExpense: Category = {
  id: "inne-exp",
  name: "Inne wydatki",
  type: "expense",
  user_id: "u1",
  created_at: "",
  updated_at: "",
};

const transport: Category = {
  id: "transport",
  name: "Transport",
  type: "expense",
  user_id: "u1",
  created_at: "",
  updated_at: "",
};

describe("detectCategoryRuleSuggestions", () => {
  it("suggests a rule when the same merchant repeats in Inne", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      type: "expense" as const,
      description: `NETFLIX ${i}`,
      counterparty: "NETFLIX",
      selected_category_id: transport.id,
      category_name: transport.name,
    }));
    const suggestions = detectCategoryRuleSuggestions(rows, [inneExpense, transport]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.text).toBe("NETFLIX");
    expect(suggestions[0]?.count).toBe(3);
  });
});
