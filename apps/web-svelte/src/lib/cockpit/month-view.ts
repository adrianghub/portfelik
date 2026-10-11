import { isAllocationExpense } from "$lib/services/goal-spending";
import type { CockpitSpendItem } from "$lib/cockpit/indicators";
import {
  cockpitMonthIndicators,
  type CockpitMonthIndicators,
  type CockpitMonthScope,
} from "$lib/cockpit/month";
import { calendarMonthBounds, type CalendarMonth } from "$lib/cockpit/month-window";
import type { SpendForecastLink } from "$lib/plans/spend-forecast";
import type { ScopeFilter } from "$lib/utils/list-view-url";

export interface CockpitMonthRow {
  id: string;
  type: "income" | "expense";
  amount: number;
  status: string;
  date: string;
  currency: string;
  groupId: string | null;
  categoryId: string | null;
}

export interface CockpitMonthViewInput {
  scopeFilter: ScopeFilter;
  month: CalendarMonth;
  today: string;
  /** Private anchor only. A household or Wszystkie never receives this row. */
  privateAnchor: { opening_amount: number; as_of_date: string } | null;
  rows: readonly CockpitMonthRow[];
  items: readonly CockpitSpendItem[];
  links: readonly SpendForecastLink[];
  saveLinkedIds?: ReadonlySet<string>;
  celeCategoryId?: string | null;
}

function scopeOf(scopeFilter: ScopeFilter): CockpitMonthScope {
  if (scopeFilter === "all") return { kind: "all" };
  if (scopeFilter === "own") return { kind: "private" };
  return { kind: "group", groupId: scopeFilter };
}

function uniqueRows(rows: readonly CockpitMonthRow[]): CockpitMonthRow[] {
  const seen = new Set<string>();
  const unique: CockpitMonthRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return unique;
}

/**
 * One calendar month on the existing cash and spend engines.
 * Remainder flows are attached inside `cockpitMonthIndicators`, so callers pass
 * ledger rows once.
 */
export function buildCockpitMonthView(input: CockpitMonthViewInput): CockpitMonthIndicators {
  const scope = scopeOf(input.scopeFilter);
  const rows = uniqueRows(input.rows).filter((row) => {
    if (scope.kind === "all") return true;
    if (scope.kind === "private") return row.groupId === null;
    return row.groupId === scope.groupId;
  });
  const saveLinkedIds = input.saveLinkedIds ?? new Set<string>();
  const allocationTransactionIds = new Set(
    rows
      .filter((row) =>
        isAllocationExpense(
          { id: row.id, type: row.type, category_id: row.categoryId ?? "" },
          saveLinkedIds,
          input.celeCategoryId
        )
      )
      .map((row) => row.id)
  );
  const bounds = calendarMonthBounds(input.month);
  return cockpitMonthIndicators({
    scope,
    anchor: scope.kind === "private" ? input.privateAnchor : null,
    transactions: rows,
    items: input.items,
    links: input.links,
    today: input.today,
    monthStart: bounds.monthStart,
    monthEnd: bounds.monthEnd,
    allocationTransactionIds,
  });
}
