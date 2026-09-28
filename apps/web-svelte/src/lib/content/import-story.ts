import * as m from "$lib/paraglide/messages";
import { formatCurrency } from "$lib/utils";

export interface ImportStoryLine {
  type: "income" | "expense";
  amount: number;
  categoryName: string | null;
}

/** Calm summary after a committed import: income, expenses, top category. */
export function describeImportedMoney(lines: ImportStoryLine[]): string | null {
  if (lines.length === 0) return null;

  let income = 0;
  let spent = 0;
  const byCategory = new Map<string, number>();

  for (const line of lines) {
    if (line.type === "income") {
      income += line.amount;
      continue;
    }
    spent += line.amount;
    const name = line.categoryName?.trim();
    if (!name) continue;
    byCategory.set(name, (byCategory.get(name) ?? 0) + line.amount);
  }

  const parts: string[] = [];
  if (income > 0) parts.push(m.bank_commit_story_income({ amount: formatCurrency(income) }));
  if (spent > 0) parts.push(m.bank_commit_story_spent({ amount: formatCurrency(spent) }));
  if (parts.length === 0) return null;

  let topName: string | null = null;
  let topAmount = 0;
  for (const [name, amount] of byCategory) {
    if (amount > topAmount) {
      topName = name;
      topAmount = amount;
    }
  }

  if (topName) {
    parts.push(m.bank_commit_story_top({ name: topName, amount: formatCurrency(topAmount) }));
  }
  return parts.join(" ");
}

/**
 * Commit can reject rows the client still treats as imports.
 * Use a story only when those rows are gone, or when nothing was rejected.
 */
export function importStoryAfterCommit(input: {
  duplicatesCommit: number;
  lines: ImportStoryLine[];
  fromCommittedRows: boolean;
}): string | null {
  if (input.duplicatesCommit > 0 && !input.fromCommittedRows) return null;
  return describeImportedMoney(input.lines);
}
