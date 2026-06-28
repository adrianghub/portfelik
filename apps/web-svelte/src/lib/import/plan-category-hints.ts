import type { MatchableRow } from "$lib/import/categorize";

const STOP_WORDS = new Set([
  "i",
  "w",
  "z",
  "na",
  "do",
  "za",
  "po",
  "od",
  "dla",
  "nie",
  "jak",
  "cel",
  "cele",
  "plan",
  "oszczędności",
  "oszczednosci",
]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-–,./()]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export interface SavePlanHint {
  planId: string;
  planName: string;
  matchedKeyword: string;
}

/**
 * Suggest a save plan when import row text overlaps plan title keywords.
 * Deterministic string overlap — not AI.
 */
export function matchSavePlanHint(
  row: MatchableRow,
  plans: { id: string; name: string }[]
): SavePlanHint | null {
  const haystack = `${row.description} ${row.counterparty ?? ""}`.toLowerCase();
  if (haystack.trim() === "") return null;

  let best: SavePlanHint | null = null;
  for (const plan of plans) {
    const planKeys = keywords(plan.name);
    for (const kw of planKeys) {
      if (!haystack.includes(kw)) continue;
      if (!best || kw.length > best.matchedKeyword.length) {
        best = { planId: plan.id, planName: plan.name, matchedKeyword: kw };
      }
    }
  }
  return best;
}
