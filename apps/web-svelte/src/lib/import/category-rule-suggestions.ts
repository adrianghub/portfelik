import { INNE_CATEGORY_NAMES } from "$lib/constants/categories";
import { suggestRuleText, type MatchableRow } from "$lib/import/categorize";
import type { Category, TransactionType } from "$lib/types";

export interface CategoryRuleSuggestion {
  /** Stable key for dismiss memory. */
  signature: string;
  text: string;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  count: number;
}

export interface SuggestableImportRow extends MatchableRow {
  selected_category_id: string | null;
  category_name?: string | null;
}

const MIN_REPEAT_COUNT = 3;

function rowCategoryName(row: SuggestableImportRow, categories: Category[]): string | null {
  if (row.category_name) return row.category_name;
  if (!row.selected_category_id) return null;
  return categories.find((c) => c.id === row.selected_category_id)?.name ?? null;
}

function isInneCategoryName(name: string | null): boolean {
  return name != null && INNE_CATEGORY_NAMES.has(name);
}

/**
 * Detect repeated merchants where the user consistently picked the same real category.
 * Also surfaces Inne repeats when every row still shares the same non-null category
 * (including Inne) so import review can offer one-click rule capture.
 */
export function detectCategoryRuleSuggestions(
  rows: SuggestableImportRow[],
  categories: Category[],
  minCount = MIN_REPEAT_COUNT
): CategoryRuleSuggestion[] {
  const buckets = new Map<
    string,
    {
      text: string;
      type: TransactionType;
      counts: Map<string, { name: string; count: number }>;
      total: number;
    }
  >();

  for (const row of rows) {
    if (!row.selected_category_id) continue;
    const text = suggestRuleText(row);
    if (text.trim() === "") continue;
    const key = `${row.type}|${text.toLowerCase()}`;
    const name = rowCategoryName(row, categories) ?? "";
    const bucket = buckets.get(key) ?? {
      text,
      type: row.type,
      counts: new Map(),
      total: 0,
    };
    bucket.total += 1;
    const cur = bucket.counts.get(row.selected_category_id);
    if (cur) {
      cur.count += 1;
    } else {
      bucket.counts.set(row.selected_category_id, { name, count: 1 });
    }
    buckets.set(key, bucket);
  }

  const suggestions: CategoryRuleSuggestion[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.total < minCount) continue;
    let bestId = "";
    let bestName = "";
    let bestCount = 0;
    for (const [categoryId, { name, count }] of bucket.counts) {
      if (count > bestCount) {
        bestId = categoryId;
        bestName = name;
        bestCount = count;
      }
    }
    if (!bestId || bestCount < minCount) continue;
    if (isInneCategoryName(bestName)) continue;
    suggestions.push({
      signature: `category_rule:${bucket.type}:${bucket.text.toLowerCase()}:${bestId}`,
      text: bucket.text,
      type: bucket.type,
      categoryId: bestId,
      categoryName: bestName,
      count: bestCount,
    });
  }

  return suggestions.sort((a, b) => b.count - a.count);
}
