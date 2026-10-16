import { isAllocationExpense } from "$lib/services/goal-spending";
import type { CockpitSpendItem } from "$lib/cockpit/indicators";
import { buildCockpitForecastChart, type CockpitForecastChart } from "$lib/cockpit/forecast-chart";
import {
  cockpitMonthIndicators,
  type CockpitMonthIndicators,
  type CockpitMonthInput,
  type CockpitMonthScope,
} from "$lib/cockpit/month";
import { calendarMonthBounds, type CalendarMonth } from "$lib/cockpit/month-window";
import type { SpendForecastLink } from "$lib/plans/spend-forecast";
import type { CashAnchor } from "$lib/services/cash-position";
import type { ScopeFilter } from "$lib/utils/list-view-url";

export interface CockpitMonthViewResult extends CockpitMonthIndicators {
  /**
   * Anchor date when private Wydatki start inside the month, not on day 1.
   * Null when the figure is a full month, or when Wydatki are withheld.
   */
  expensesFrom: string | null;
  /**
   * True when Dom or Wszystkie Wydatki are withheld because plan remainders
   * and recurring rows are not in the figure yet.
   */
  expensesIncomplete: boolean;
}

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
  /**
   * Inclusive window. When set, the counters use this range instead of the
   * calendar month. The money rules stay the same.
   */
  range?: { start: string; end: string };
  today: string;
  /** Private anchor only. A household or Wszystkie never receives this row. */
  privateAnchor: CashAnchor | null;
  rows: readonly CockpitMonthRow[];
  items: readonly CockpitSpendItem[];
  links: readonly SpendForecastLink[];
  saveLinkedIds?: ReadonlySet<string>;
  celeCategoryId?: string | null;
  /**
   * `partial` means the caller does not yet have every ledger row of this
   * month. Wydatki stay empty so a short window cannot look complete.
   */
  monthLedger?: "complete" | "partial";
}

function scopeOf(scopeFilter: ScopeFilter): CockpitMonthScope {
  if (scopeFilter === "all") return { kind: "all" };
  if (scopeFilter === "own") return { kind: "private" };
  return { kind: "group", groupId: scopeFilter };
}

/** First-wins by transaction id — cash-history and month ledger often overlap. */
export function uniqueCockpitMonthRows(rows: readonly CockpitMonthRow[]): CockpitMonthRow[] {
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
function monthInput(input: CockpitMonthViewInput): CockpitMonthInput {
  const scope = scopeOf(input.scopeFilter);
  const rows = uniqueCockpitMonthRows(input.rows).filter((row) => {
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
  const bounds = input.range
    ? { monthStart: input.range.start.slice(0, 10), monthEnd: input.range.end.slice(0, 10) }
    : calendarMonthBounds(input.month);
  return {
    scope,
    anchor: scope.kind === "private" ? input.privateAnchor : null,
    transactions: rows,
    items: input.items,
    links: input.links,
    today: input.today,
    monthStart: bounds.monthStart,
    monthEnd: bounds.monthEnd,
    allocationTransactionIds,
  };
}

export function cockpitForecastChart(input: CockpitMonthViewInput): CockpitForecastChart {
  if (input.monthLedger === "partial") {
    return {
      points: null,
      domainStart: null,
      domainEnd: null,
      coverage: "full",
      todayRatio: null,
      balance: null,
      forecast: null,
      spent: null,
      comparison: null,
    };
  }
  return buildCockpitForecastChart(monthInput(input));
}

export function buildCockpitMonthView(input: CockpitMonthViewInput): CockpitMonthViewResult {
  const model = monthInput(input);
  const indicators = cockpitMonthIndicators(model);
  const anchorDay = input.privateAnchor?.as_of_date.slice(0, 10) ?? null;
  const clippedByAnchor =
    model.scope.kind === "private" &&
    anchorDay != null &&
    anchorDay > model.monthStart &&
    anchorDay <= model.monthEnd;
  const scopeIncomplete = model.scope.kind === "group" || model.scope.kind === "all";
  const withholdExpenses = input.monthLedger === "partial" || scopeIncomplete;
  return {
    ...indicators,
    expenses: withholdExpenses ? null : indicators.expenses,
    expensesFrom: withholdExpenses || !clippedByAnchor ? null : anchorDay,
    expensesIncomplete: scopeIncomplete && input.monthLedger !== "partial",
  };
}
