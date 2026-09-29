import type { TransactionStatus } from "$lib/types";

export type CardBandId = "overdue" | "upcoming" | "draft" | "history";

const BAND_ORDER: readonly CardBandId[] = ["overdue", "upcoming", "draft", "history"];

type BandRow = {
  status: TransactionStatus;
  projected?: boolean;
};

/** Overdue and drafts are not "coming up" and they are not history. */
export function transactionCardBand(tx: BandRow): CardBandId {
  if (tx.status === "overdue") return "overdue";
  if (tx.projected === true || tx.status === "upcoming") return "upcoming";
  if (tx.status === "draft") return "draft";
  return "history";
}

export function partitionTransactionCards<T extends BandRow>(
  rows: T[]
): { id: CardBandId; titled: boolean; rows: T[] }[] {
  const buckets = new Map<CardBandId, T[]>();
  for (const row of rows) {
    const id = transactionCardBand(row);
    const list = buckets.get(id) ?? [];
    list.push(row);
    buckets.set(id, list);
  }
  const present = BAND_ORDER.flatMap((id) => {
    const bandRows = buckets.get(id);
    return bandRows && bandRows.length > 0 ? [{ id, rows: bandRows }] : [];
  });
  if (present.length <= 1) {
    return [{ id: present[0]?.id ?? "history", titled: false, rows }];
  }
  return present.map((band) => ({ ...band, titled: true }));
}
