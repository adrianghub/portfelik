import { livePosition, type PositionTx } from "$lib/services/cash-position";
import type { CashPosition } from "$lib/types";

/** Monthly reconciliation cadence required before money can receive new jobs. */
export const MAX_TRUSTED_CASH_ANCHOR_AGE_DAYS = 31;

export type MoneyAvailabilityStatus = "ready" | "missing_anchor" | "future_anchor" | "stale_anchor";

export type PrivatePositionTx = PositionTx & { group_id: null };

export interface PrivateMoneyAvailabilityInput {
  /** Private cash anchor. Group and mixed scopes are deliberately unsupported. */
  anchor: Pick<CashPosition, "opening_amount" | "as_of_date"> | null;
  /** Private-scope ledger rows used by the canonical live-position engine. */
  transactions: PrivatePositionTx[];
  /** Current balances already given jobs. Future assignment storage will supply this value. */
  assignedCash: number;
  /** Informational expected income inside the chosen planning horizon. */
  expectedIncome: number;
  /** Informational upcoming/overdue expenses inside the chosen planning horizon. */
  forecastObligations: number;
  /** Product-local calendar day (YYYY-MM-DD). */
  today: string;
  maxAnchorAgeDays?: number;
}

export interface PrivateMoneyAvailability {
  status: MoneyAvailabilityStatus;
  isConfident: boolean;
  anchorAgeDays: number | null;
  liveCash: number | null;
  eligibleLiveCash: number | null;
  assignedCash: number;
  /** Signed balance. A negative value means assignments exceed eligible live cash. */
  unassignedCash: number | null;
  overassignedCash: number | null;
  cashShortfall: number | null;
  expectedIncome: number;
  forecastObligations: number;
  projectedCashAfterForecast: number | null;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

function requireNonnegativeMoney(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative amount`);
  }
  return toCents(value);
}

function calendarDayNumber(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("date must use YYYY-MM-DD");
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new RangeError("date must be a valid calendar day");
  }
  return timestamp / 86_400_000;
}

function unavailableResult(
  status: Exclude<MoneyAvailabilityStatus, "ready">,
  anchorAgeDays: number | null,
  assignedCents: number,
  expectedIncomeCents: number,
  forecastObligationsCents: number
): PrivateMoneyAvailability {
  return {
    status,
    isConfident: false,
    anchorAgeDays,
    liveCash: null,
    eligibleLiveCash: null,
    assignedCash: fromCents(assignedCents),
    unassignedCash: null,
    overassignedCash: null,
    cashShortfall: null,
    expectedIncome: fromCents(expectedIncomeCents),
    forecastObligations: fromCents(forecastObligationsCents),
    projectedCashAfterForecast: null,
  };
}

/**
 * Canonical private-scope equation for future monthly money jobs.
 *
 * eligible live cash = max(0, reconciled live cash)
 * unassigned cash = eligible live cash − assigned cash
 *
 * Expected income and forecast obligations are shown alongside the equation,
 * but never enter the assignable pool until they become paid cash or funded
 * assignments. Missing/future/stale anchors intentionally return no confident
 * live, eligible, unassigned, or projected amount.
 */
export function computePrivateMoneyAvailability(
  input: PrivateMoneyAvailabilityInput
): PrivateMoneyAvailability {
  const assignedCents = requireNonnegativeMoney("assignedCash", input.assignedCash);
  const expectedIncomeCents = requireNonnegativeMoney("expectedIncome", input.expectedIncome);
  const forecastObligationsCents = requireNonnegativeMoney(
    "forecastObligations",
    input.forecastObligations
  );
  const maxAge = input.maxAnchorAgeDays ?? MAX_TRUSTED_CASH_ANCHOR_AGE_DAYS;
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new RangeError("maxAnchorAgeDays must be a non-negative integer");
  }

  const todayDay = calendarDayNumber(input.today);
  if (!input.anchor) {
    return unavailableResult(
      "missing_anchor",
      null,
      assignedCents,
      expectedIncomeCents,
      forecastObligationsCents
    );
  }

  requireNonnegativeMoney("anchor.opening_amount", input.anchor.opening_amount);
  for (const transaction of input.transactions) {
    if (transaction.group_id !== null) {
      throw new RangeError("transactions must belong to the private scope");
    }
    requireNonnegativeMoney("transaction.amount", transaction.amount);
  }

  const anchorAgeDays = todayDay - calendarDayNumber(input.anchor.as_of_date);
  if (anchorAgeDays < 0) {
    return unavailableResult(
      "future_anchor",
      anchorAgeDays,
      assignedCents,
      expectedIncomeCents,
      forecastObligationsCents
    );
  }
  if (anchorAgeDays > maxAge) {
    return unavailableResult(
      "stale_anchor",
      anchorAgeDays,
      assignedCents,
      expectedIncomeCents,
      forecastObligationsCents
    );
  }

  const liveCents = toCents(livePosition(input.anchor, input.transactions));
  const eligibleCents = Math.max(0, liveCents);
  const unassignedCents = eligibleCents - assignedCents;

  return {
    status: "ready",
    isConfident: true,
    anchorAgeDays,
    liveCash: fromCents(liveCents),
    eligibleLiveCash: fromCents(eligibleCents),
    assignedCash: fromCents(assignedCents),
    unassignedCash: fromCents(unassignedCents),
    overassignedCash: fromCents(Math.max(0, -unassignedCents)),
    cashShortfall: fromCents(Math.max(0, -liveCents)),
    expectedIncome: fromCents(expectedIncomeCents),
    forecastObligations: fromCents(forecastObligationsCents),
    projectedCashAfterForecast: fromCents(
      liveCents + expectedIncomeCents - forecastObligationsCents
    ),
  };
}
