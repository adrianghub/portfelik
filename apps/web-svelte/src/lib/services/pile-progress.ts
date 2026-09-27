import type { CategoryCapPeriod } from "$lib/types";

export interface PileSpendRow {
  category_id: string;
  type: string;
  status: string;
  amount: number;
  date: string;
}

/** Inclusive start, exclusive end, as YYYY-MM-DD. */
export function pileWindow(
  period: CategoryCapPeriod,
  today: string
): { start: string; end: string } {
  const [yearText, monthText] = today.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (period === "year") {
    return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
  }
  const startMonth = String(month).padStart(2, "0");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    start: `${year}-${startMonth}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

export function spentInPile(
  rows: PileSpendRow[],
  categoryId: string,
  period: CategoryCapPeriod,
  today: string
): number {
  const { start, end } = pileWindow(period, today);
  return rows.reduce((sum, row) => {
    if (row.category_id !== categoryId) return sum;
    if (row.type !== "expense" || row.status !== "paid") return sum;
    const day = row.date.slice(0, 10);
    if (day < start || day >= end) return sum;
    return sum + row.amount;
  }, 0);
}
