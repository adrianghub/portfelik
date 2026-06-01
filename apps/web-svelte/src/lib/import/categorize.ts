// Deterministic categorization-rule matcher for bank-import rows.
//
// Pure, sync, DOM-free so it unit-tests against fixtures. Given the caller's
// rules and visible categories, returns the category id to pre-fill for a row,
// or null when nothing matches.
//
// Matching contract:
//   * Rules are tried in priority order (DESC); first match wins.
//   * A matched rule only applies if its target category's type equals the
//     row's type - a rule must never assign an income category to an expense.
//   * Text comparison is trimmed + case-insensitive.
//   * Rule kinds (mirrors the categorization_rules CHECK constraint):
//       exact     - description OR counterparty equals the rule's text
//       contains  - description OR counterparty contains the rule's text
//       type      - row type equals match_type
//       composite - row type equals match_type AND a text (contains) match
//   For exact/contains, a rule may set match_description, match_counterparty,
//   or both; the row matches if ANY set field matches.

import type { CategorizationRule, Category, TransactionType } from "$lib/types";

export interface MatchableRow {
  type: TransactionType;
  description: string;
  counterparty?: string | null;
}

export function normalizeRuleText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const COMMON_BANK_TOKENS = new Set([
  "zakup",
  "zakupy",
  "towarow",
  "towarów",
  "uslug",
  "usług",
  "przelew",
  "wychodzący",
  "wychodzacy",
  "przychodzący",
  "przychodzacy",
  "platnosc",
  "płatność",
  "karta",
  "operacja",
]);

export function suggestRuleText(
  row: MatchableRow,
  preferredField?: "description" | "counterparty"
): string {
  const raw =
    preferredField === "description"
      ? row.description
      : preferredField === "counterparty"
        ? (row.counterparty ?? row.description)
        : (row.counterparty ?? row.description);
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized === "") return "";

  for (const [token] of normalized.matchAll(/[\p{L}\p{N}]{3,}/gu)) {
    if (!COMMON_BANK_TOKENS.has(token.toLowerCase())) return token;
  }
  return normalized;
}

function textMatches(
  rule: CategorizationRule,
  row: MatchableRow,
  mode: "exact" | "contains"
): boolean {
  const desc = normalizeRuleText(row.description);
  const cp = normalizeRuleText(row.counterparty);

  if (rule.match_description != null) {
    const needle = normalizeRuleText(rule.match_description);
    if (needle !== "" && (mode === "exact" ? desc === needle : desc.includes(needle))) return true;
  }
  if (rule.match_counterparty != null) {
    const needle = normalizeRuleText(rule.match_counterparty);
    if (needle !== "" && (mode === "exact" ? cp === needle : cp.includes(needle))) return true;
  }
  return false;
}

export function matchRule(rule: CategorizationRule, row: MatchableRow): boolean {
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
 * `rules` need not be pre-sorted - this sorts by priority DESC (ties broken by
 * stable order) defensively.
 */
export function matchCategory(
  row: MatchableRow,
  rules: CategorizationRule[],
  categories: Category[]
): string | null {
  return resolveCategorizationRule(row, rules, categories)?.category_id ?? null;
}

export function resolveCategorizationRule(
  row: MatchableRow,
  rules: CategorizationRule[],
  categories: Category[]
): CategorizationRule | null {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const ordered = [...rules].sort((a, b) => {
    const byPriority = b.priority - a.priority;
    if (byPriority !== 0) return byPriority;
    return a.created_at.localeCompare(b.created_at);
  });

  for (const rule of ordered) {
    if (!matchRule(rule, row)) continue;
    const category = categoryById.get(rule.category_id);
    // Skip rules whose category is gone or whose type contradicts the row.
    if (!category || category.type !== row.type) continue;
    return rule;
  }
  return null;
}

export function isEquivalentCategorizationRule(
  a: Pick<
    CategorizationRule,
    "kind" | "match_description" | "match_counterparty" | "match_type" | "category_id"
  >,
  b: Pick<
    CategorizationRule,
    "kind" | "match_description" | "match_counterparty" | "match_type" | "category_id"
  >
): boolean {
  return (
    a.kind === b.kind &&
    normalizeRuleText(a.match_description) === normalizeRuleText(b.match_description) &&
    normalizeRuleText(a.match_counterparty) === normalizeRuleText(b.match_counterparty) &&
    (a.match_type ?? null) === (b.match_type ?? null) &&
    a.category_id === b.category_id
  );
}

export function findDuplicateCategorizationRule<
  T extends Pick<
    CategorizationRule,
    "kind" | "match_description" | "match_counterparty" | "match_type" | "category_id"
  >,
>(
  rules: T[],
  candidate: Pick<
    CategorizationRule,
    "kind" | "match_description" | "match_counterparty" | "match_type" | "category_id"
  >
): T | null {
  return rules.find((rule) => isEquivalentCategorizationRule(rule, candidate)) ?? null;
}
