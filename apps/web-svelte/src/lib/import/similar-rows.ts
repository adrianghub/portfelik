import { normalizeTransactionText } from "./transaction-text";

type SimilarRow = {
  id: string;
  type: "income" | "expense";
  currency: string;
  description: string;
  edited_description?: string | null;
  counterparty: string | null;
  decision?: string;
  selected_category_id?: string | null;
};

/** A conservative identity until bank adapters expose reliable merchant hints.
 * Never group by a processor, substring or the first word of a description.
 */
export function transactionSignature(row: Omit<SimilarRow, "id">): string | null {
  const description = normalizeTransactionText(
    row.edited_description ?? row.description
  ).normalized;
  const counterparty = normalizeTransactionText(row.counterparty).normalized;
  if (!description) return null;
  return JSON.stringify([row.type, row.currency, description, counterparty]);
}

export function areSimilarImportRows(a: SimilarRow, b: SimilarRow): boolean {
  const signature = transactionSignature(a);
  return signature !== null && signature === transactionSignature(b);
}

export function groupSimilarImportRows<T extends SimilarRow>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const signature = transactionSignature(row);
    // Keep conflicting review decisions visible on separate cards. Bulk similarity
    // remains independent of category/decision and is checked explicitly by the flow.
    const key =
      signature === null
        ? JSON.stringify(["row", row.id])
        : JSON.stringify([signature, row.decision, row.selected_category_id]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()];
}
