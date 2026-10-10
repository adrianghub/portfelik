import { SUPPORTED_LEDGER_CURRENCY } from "$lib/ledger-currency";
import { moneyDifference, sumMoneyAmounts } from "$lib/money";
import type { PositionTx } from "$lib/services/cash-position";
import type { SpendItemStatus } from "$lib/plans/spend";

/** Confirmed line on a spend plan. Group plans stay out of the private cash forecast. */
export interface SpendForecastItem {
  id: string;
  amount: number;
  dueDate: string | null;
  status: SpendItemStatus;
  groupId: string | null;
}

/** A real transaction already linked to a line. */
export interface SpendForecastLink {
  planItemId: string;
  transactionId: string;
  amount: number;
  countsAsPaid: boolean;
}

/**
 * Confirmed private remainders the cash forecast does not already contain.
 * A paid deposit stays in the live balance. A scheduled transaction already
 * passed into the forecast is not subtracted again. Planned, estimated, and
 * cancelled lines are not obligations.
 */
export function confirmedSpendForecastFlows(input: {
  items: readonly SpendForecastItem[];
  links: readonly SpendForecastLink[];
  forecastTransactionIds: ReadonlySet<string>;
  today: string;
}): PositionTx[] {
  const linksByItem = new Map<string, SpendForecastLink[]>();
  for (const link of input.links) {
    const list = linksByItem.get(link.planItemId) ?? [];
    list.push(link);
    linksByItem.set(link.planItemId, list);
  }

  const today = input.today.slice(0, 10);
  const flows: PositionTx[] = [];
  for (const item of input.items) {
    if (item.groupId !== null || item.status !== "confirmed") continue;
    const due = item.dueDate?.slice(0, 10);
    if (!due) continue;
    const links = linksByItem.get(item.id) ?? [];
    const covered = sumMoneyAmounts(
      links.filter(
        (link) => link.countsAsPaid || input.forecastTransactionIds.has(link.transactionId)
      )
    );
    const outflow = moneyDifference(item.amount, covered);
    if (outflow <= 0) continue;
    flows.push({
      type: "expense",
      amount: outflow,
      status: due < today ? "overdue" : "upcoming",
      date: due,
      currency: SUPPORTED_LEDGER_CURRENCY,
    });
  }
  return flows;
}
