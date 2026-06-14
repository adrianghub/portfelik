import { describe, expect, it } from "vitest";
import {
  findDuplicateCategorizationRule,
  matchCategory,
  resolveCategorizationRule,
  selectRetroMatches,
  suggestRuleFromRow,
  suggestRuleText,
  type MatchableRow,
  type RetroTransaction,
} from "$lib/import/categorize";
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
  it("suggests a short merchant token from noisy bank text", () => {
    expect(
      suggestRuleText({
        type: "expense",
        description: "LIDL MLYNSKA Reda POL",
        counterparty: null,
      })
    ).toBe("LIDL");
  });

  it("duplicate identity ignores case and surrounding whitespace", () => {
    const existing = [
      rule({
        kind: "contains",
        match_counterparty: "  Rossmann  ",
        category_id: expenseCat.id,
      }),
    ];

    expect(
      findDuplicateCategorizationRule(
        existing,
        rule({
          kind: "contains",
          match_counterparty: "rossmann",
          category_id: expenseCat.id,
        })
      )?.id
    ).toBe(existing[0].id);
  });

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

  it("match_day_of_month: only matches rows posted on that calendar day", () => {
    const rules = [
      rule({
        kind: "contains",
        match_description: "biedronka",
        match_day_of_month: 15,
      }),
    ];
    expect(matchCategory({ ...expenseRow, posted_at: "2026-03-15" }, rules, categories)).toBe(
      expenseCat.id
    );
    expect(matchCategory({ ...expenseRow, posted_at: "2026-03-16" }, rules, categories)).toBeNull();
    expect(matchCategory(expenseRow, rules, categories)).toBeNull();
  });

  it("exact: requires full trimmed equality, not a substring", () => {
    const substr = [rule({ kind: "exact", match_description: "biedronka" })];
    expect(matchCategory(expenseRow, substr, categories)).toBeNull();

    const full = [rule({ kind: "exact", match_description: "  biedronka 1234 warszawa  " })];
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
    expect(matchCategory({ ...expenseRow, description: "ORLEN" }, rules, categories)).toBeNull();
  });

  it("respects priority order - highest priority wins", () => {
    const rules = [
      rule({ match_description: "biedronka", category_id: expenseCat.id, priority: 1 }),
      rule({ match_description: "biedronka", category_id: otherExpenseCat.id, priority: 5 }),
    ];
    expect(matchCategory(expenseRow, rules, categories)).toBe(otherExpenseCat.id);
    expect(resolveCategorizationRule(expenseRow, rules, categories)?.id).toBe(rules[1].id);
  });

  it("never assigns a category whose type contradicts the row", () => {
    // A 'contains' rule that points at an income category must not apply to an
    // expense row - the next matching, type-correct rule is used instead.
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

describe("suggestRuleFromRow", () => {
  it("builds a contains rule from the suggested token (counterparty preferred)", () => {
    const draft = suggestRuleFromRow({
      type: "expense",
      description: "Płatność kartą",
      counterparty: "Żabka Z123",
    });
    expect(draft).toEqual({
      kind: "contains",
      match_description: "Żabka",
      match_counterparty: "Żabka",
      match_type: null,
    });
  });

  it("falls back to a description token when counterparty is absent", () => {
    const draft = suggestRuleFromRow({
      type: "expense",
      description: "Zakup Biedronka 4456",
      counterparty: null,
    });
    expect(draft?.match_description).toBe("Biedronka");
    expect(draft?.match_counterparty).toBe("Biedronka");
  });

  it("returns null when no usable token exists", () => {
    expect(suggestRuleFromRow({ type: "expense", description: "   ", counterparty: null })).toBeNull();
  });
});

describe("selectRetroMatches", () => {
  const retroRule = rule({
    kind: "contains",
    match_description: "biedronka",
    match_counterparty: "biedronka",
    category_id: expenseCat.id,
  });
  const txs: RetroTransaction[] = [
    { id: "t1", user_id: "u1", category_id: otherExpenseCat.id, type: "expense", description: "BIEDRONKA 1", counterparty: null },
    { id: "t2", user_id: "u1", category_id: expenseCat.id, type: "expense", description: "BIEDRONKA 2", counterparty: null },
    { id: "t3", user_id: "u2", category_id: null, type: "expense", description: "BIEDRONKA 3", counterparty: null },
    { id: "t4", user_id: "u1", category_id: null, type: "income", description: "BIEDRONKA refund", counterparty: null },
    { id: "t5", user_id: "u1", category_id: null, type: "expense", description: "LIDL", counterparty: null },
  ];

  it("returns only own, non-target-category, type-correct, matching transactions", () => {
    expect(selectRetroMatches(retroRule, txs, categories, "u1")).toEqual(["t1"]);
  });

  it("returns empty when the rule matches nothing", () => {
    const noneRule = rule({ match_description: "zzznope", match_counterparty: "zzznope" });
    expect(selectRetroMatches(noneRule, txs, categories, "u1")).toEqual([]);
  });
});
