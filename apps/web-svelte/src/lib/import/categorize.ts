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
  posted_at?: string | null;
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

export interface CapturedRuleDraft {
  kind: "contains";
  match_description: string;
  match_counterparty: string;
  match_type: null;
}

/**
 * Build a "contains" rule draft from a transaction the user just (re)categorized, so future
 * imports of similar rows auto-apply the same category. Mirrors the import-flow capture: the
 * suggested token is matched against both description and counterparty (OR logic), and
 * `match_type` stays null - the category-type safeguard in `matchCategory` keeps it correct.
 * Returns null when no usable token exists (caller should then offer nothing).
 */
export function suggestRuleFromRow(row: MatchableRow): CapturedRuleDraft | null {
  const text = suggestRuleText(row);
  if (text.trim() === "") return null;
  return {
    kind: "contains",
    match_description: text,
    match_counterparty: text,
    match_type: null,
  };
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

function dayOfMonthMatches(rule: CategorizationRule, row: MatchableRow): boolean {
  if (rule.match_day_of_month == null) return true;
  if (!row.posted_at) return false;
  const day = Number(row.posted_at.split("-")[2] ?? "");
  return Number.isInteger(day) && day === rule.match_day_of_month;
}

export function matchRule(rule: CategorizationRule, row: MatchableRow): boolean {
  if (!dayOfMonthMatches(rule, row)) return false;
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

/** A stored transaction reduced to what retroactive rule application needs. */
export interface RetroTransaction extends MatchableRow {
  id: string;
  user_id: string;
  category_id: string | null;
  date?: string | null;
}

/**
 * Select ids of the user's own transactions a freshly-created rule would re-categorize:
 * the rule matches (via the same safeguards as import - category exists, type agrees) and
 * the transaction is not already in the rule's target category. Pure for unit testing.
 */
export function selectRetroMatches(
  rule: CategorizationRule,
  transactions: RetroTransaction[],
  categories: Category[],
  userId: string
): string[] {
  return transactions
    .filter(
      (tx) =>
        tx.user_id === userId &&
        tx.category_id !== rule.category_id &&
        matchCategory(
          {
            type: tx.type,
            description: tx.description,
            counterparty: tx.counterparty,
            posted_at: tx.date ?? null,
          },
          [rule],
          categories
        ) === rule.category_id
    )
    .map((tx) => tx.id);
}

export function isEquivalentCategorizationRule(
  a: Pick<
    CategorizationRule,
    | "kind"
    | "match_description"
    | "match_counterparty"
    | "match_type"
    | "match_day_of_month"
    | "category_id"
  >,
  b: Pick<
    CategorizationRule,
    | "kind"
    | "match_description"
    | "match_counterparty"
    | "match_type"
    | "match_day_of_month"
    | "category_id"
  >
): boolean {
  return (
    a.kind === b.kind &&
    normalizeRuleText(a.match_description) === normalizeRuleText(b.match_description) &&
    normalizeRuleText(a.match_counterparty) === normalizeRuleText(b.match_counterparty) &&
    (a.match_type ?? null) === (b.match_type ?? null) &&
    (a.match_day_of_month ?? null) === (b.match_day_of_month ?? null) &&
    a.category_id === b.category_id
  );
}

export function findDuplicateCategorizationRule<
  T extends Pick<
    CategorizationRule,
    | "kind"
    | "match_description"
    | "match_counterparty"
    | "match_type"
    | "match_day_of_month"
    | "category_id"
  >,
>(
  rules: T[],
  candidate: Pick<
    CategorizationRule,
    | "kind"
    | "match_description"
    | "match_counterparty"
    | "match_type"
    | "match_day_of_month"
    | "category_id"
  >
): T | null {
  return rules.find((rule) => isEquivalentCategorizationRule(rule, candidate)) ?? null;
}
