// src/lib/import/filter-rows.ts
export interface ImportRowFilter {
  text: string;
  amountMin: number | null;
  amountMax: number | null;
  categoryId: string | null;
}

interface FilterableRow {
  description: string;
  counterparty: string | null;
  amount: number;
  selected_category_id: string | null;
}

export const EMPTY_IMPORT_ROW_FILTER: ImportRowFilter = {
  text: "",
  amountMin: null,
  amountMax: null,
  categoryId: null,
};

export function isImportRowFilterActive(f: ImportRowFilter): boolean {
  return (
    f.text.trim() !== "" || f.amountMin !== null || f.amountMax !== null || f.categoryId !== null
  );
}

export function filterImportRows<T extends FilterableRow>(rows: T[], f: ImportRowFilter): T[] {
  const q = f.text.trim().toLocaleLowerCase("pl");
  return rows.filter((r) => {
    if (q) {
      const hay = `${r.description} ${r.counterparty ?? ""}`.toLocaleLowerCase("pl");
      if (!hay.includes(q)) return false;
    }
    if (f.amountMin !== null && r.amount < f.amountMin) return false;
    if (f.amountMax !== null && r.amount > f.amountMax) return false;
    if (f.categoryId !== null && r.selected_category_id !== f.categoryId) return false;
    return true;
  });
}
