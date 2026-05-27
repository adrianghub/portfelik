import { describe, expect, it } from "vitest";
import { matchCategory, type MatchableRow } from "$lib/import/categorize";
import type { CategorizationRule, Category } from "$lib/types";

const expenseCat: Category = {
  id: "cat-expense",
  name: "Zakupy",
  type: "expense",
  user_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const incomeCat: Category = {
  id: "cat-income",
  name: "Wypłata",
  type: "income",
  user_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const otherExpenseCat: Category = {
  id: "cat-expense-2",
  name: "Transport",
  type: "expense",
  user_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const categories = [expenseCat, incomeCat, otherExpenseCat];

function rule(overrides: Partial<CategorizationRule>): CategorizationRule {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    kind: "contains",
    match_description: null,
    match_counterparty: null,
    match_type: null,
    category_id: expenseCat.id,
    priority: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const expenseRow: MatchableRow = {
  type: "expense",
  description: "BIEDRONKA 1234 WARSZAWA",
  counterparty: "Jeronimo Martins",
};

describe("import/categorize matchCategory", () => {
  it("returns null when no rules match", () => {
    expect(matchCategory(expenseRow, [], categories)).toBeNull();
    expect(
      matchCategory(expenseRow, [rule({ kind: "contains", match_description: "lidl" })], categories)
    ).toBeNull();
  });

  it("contains: matches a substring of the description (case-insensitive)", () => {
    const rules = [rule({ kind: "contains", match_description: "biedronka" })];
    expect(matchCategory(expenseRow, rules, categories)).toBe(expenseCat.id);
  });

  it("contains: matches against counterparty too", () => {
    const rules = [rule({ kind: "contains", match_counterparty: "jeronimo" })];
    expect(matchCategory(expenseRow, rules, categories)).toBe(expenseCat.id);
  });

  it("exact: requires full trimmed equality, not a substring", () => {
    const substr = [rule({ kind: "exact", match_description: "biedronka" })];
    expect(matchCategory(expenseRow, substr, categories)).toBeNull();

    const full = [
      rule({ kind: "exact", match_description: "  biedronka 1234 warszawa  " }),
    ];
    expect(matchCategory(expenseRow, full, categories)).toBe(expenseCat.id);
  });

  it("type: matches purely on transaction type", () => {
    const rules = [rule({ kind: "type", match_type: "expense", category_id: expenseCat.id })];
    expect(matchCategory(expenseRow, rules, categories)).toBe(expenseCat.id);
    expect(matchCategory({ ...expenseRow, type: "income" }, rules, categories)).toBeNull();
  });

  it("composite: requires BOTH a text match and the type", () => {
    const rules = [
      rule({
        kind: "composite",
        match_description: "biedronka",
        match_type: "expense",
        category_id: expenseCat.id,
      }),
    ];
    expect(matchCategory(expenseRow, rules, categories)).toBe(expenseCat.id);
    // Text matches but type differs → no match.
    expect(matchCategory({ ...expenseRow, type: "income" }, rules, categories)).toBeNull();
    // Type matches but text differs → no match.
    expect(
      matchCategory({ ...expenseRow, description: "ORLEN" }, rules, categories)
    ).toBeNull();
  });

  it("respects priority order — highest priority wins", () => {
    const rules = [
      rule({ match_description: "biedronka", category_id: expenseCat.id, priority: 1 }),
      rule({ match_description: "biedronka", category_id: otherExpenseCat.id, priority: 5 }),
    ];
    expect(matchCategory(expenseRow, rules, categories)).toBe(otherExpenseCat.id);
  });

  it("never assigns a category whose type contradicts the row", () => {
    // A 'contains' rule that points at an income category must not apply to an
    // expense row — the next matching, type-correct rule is used instead.
    const rules = [
      rule({ match_description: "biedronka", category_id: incomeCat.id, priority: 10 }),
      rule({ match_description: "biedronka", category_id: expenseCat.id, priority: 1 }),
    ];
    expect(matchCategory(expenseRow, rules, categories)).toBe(expenseCat.id);
  });

  it("skips rules whose category no longer exists", () => {
    const rules = [rule({ match_description: "biedronka", category_id: "deleted-cat" })];
    expect(matchCategory(expenseRow, rules, categories)).toBeNull();
  });
});
