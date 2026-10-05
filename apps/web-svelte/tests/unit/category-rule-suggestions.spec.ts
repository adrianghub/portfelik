import { describe, expect, it } from "vitest";
import { detectCategoryRuleSuggestions } from "$lib/import/category-rule-suggestions";
import type { Category } from "$lib/types";

const inneExpense: Category = {
  id: "inne-exp",
  name: "Inne wydatki",
  type: "expense",
  user_id: "u1",
  cap_amount: null,
  cap_period: null,
  created_at: "",
  updated_at: "",
};

const transport: Category = {
  id: "transport",
  name: "Transport",
  type: "expense",
  user_id: "u1",
  cap_amount: null,
  cap_period: null,
  created_at: "",
  updated_at: "",
};

describe("detectCategoryRuleSuggestions", () => {
  it("suggests a rule when the same actual description repeats with one category", () => {
    const rows = Array.from({ length: 3 }, () => ({
      type: "expense" as const,
      description: "NETFLIX.COM AMSTERDAM",
      counterparty: "NETFLIX",
      selected_category_id: transport.id,
      category_name: transport.name,
    }));
    const suggestions = detectCategoryRuleSuggestions(rows, [inneExpense, transport]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.text).toBe("NETFLIX.COM AMSTERDAM");
    expect(suggestions[0]?.count).toBe(3);
  });
  it("does not group unrelated descriptions by the same first word or payment processor", () => {
    const rows = ["PRZELEW NETFLIX", "PRZELEW ALLEGRO", "PRZELEW CZYNSZ"].map((description) => ({
      type: "expense" as const,
      description,
      counterparty: "PayU",
      selected_category_id: transport.id,
    }));
    expect(detectCategoryRuleSuggestions(rows, [transport])).toEqual([]);
  });
  it("does not propose a persistent rule when category choices conflict", () => {
    const rows = [transport.id, transport.id, transport.id, inneExpense.id].map(
      (selected_category_id) => ({
        type: "expense" as const,
        description: "NETFLIX",
        selected_category_id,
      })
    );
    expect(detectCategoryRuleSuggestions(rows, [inneExpense, transport])).toEqual([]);
  });
});
