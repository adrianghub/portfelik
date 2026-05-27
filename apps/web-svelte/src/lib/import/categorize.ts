// Deterministic categorization-rule matcher for bank-import rows.
//
// Pure, sync, DOM-free so it unit-tests against fixtures. Given the caller's
// rules and visible categories, returns the category id to pre-fill for a row,
// or null when nothing matches.
//
// Matching contract:
//   * Rules are tried in priority order (DESC); first match wins.
//   * A matched rule only applies if its target category's type equals the
//     row's type — a rule must never assign an income category to an expense.
//   * Text comparison is trimmed + case-insensitive.
//   * Rule kinds (mirrors the categorization_rules CHECK constraint):
//       exact     — description OR counterparty equals the rule's text
//       contains  — description OR counterparty contains the rule's text
//       type      — row type equals match_type
//       composite — row type equals match_type AND a text (contains) match
//   For exact/contains, a rule may set match_description, match_counterparty,
//   or both; the row matches if ANY set field matches.

import type { CategorizationRule, Category, TransactionType } from "$lib/types";

export interface MatchableRow {
  type: TransactionType;
  description: string;
  counterparty?: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function textMatches(
  rule: CategorizationRule,
  row: MatchableRow,
  mode: "exact" | "contains"
): boolean {
  const desc = norm(row.description);
  const cp = norm(row.counterparty);

  if (rule.match_description != null) {
    const needle = norm(rule.match_description);
    if (needle !== "" && (mode === "exact" ? desc === needle : desc.includes(needle))) return true;
  }
  if (rule.match_counterparty != null) {
    const needle = norm(rule.match_counterparty);
    if (needle !== "" && (mode === "exact" ? cp === needle : cp.includes(needle))) return true;
  }
  return false;
}

function ruleMatches(rule: CategorizationRule, row: MatchableRow): boolean {
  switch (rule.kind) {
    case "exact":
      return textMatches(rule, row, "exact");
    case "contains":
      return textMatches(rule, row, "contains");
    case "type":
      return rule.match_type != null && row.type === rule.match_type;
    case "composite":
      return (
        rule.match_type != null &&
        row.type === rule.match_type &&
        textMatches(rule, row, "contains")
      );
    default:
      return false;
  }
}

/**
 * Resolve the category a set of rules would assign to `row`, or null.
 * `rules` need not be pre-sorted — this sorts by priority DESC (ties broken by
 * stable order) defensively.
 */
export function matchCategory(
  row: MatchableRow,
  rules: CategorizationRule[],
  categories: Category[]
): string | null {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of ordered) {
    if (!ruleMatches(rule, row)) continue;
    const category = categoryById.get(rule.category_id);
    // Skip rules whose category is gone or whose type contradicts the row.
    if (!category || category.type !== row.type) continue;
    return rule.category_id;
  }
  return null;
}
