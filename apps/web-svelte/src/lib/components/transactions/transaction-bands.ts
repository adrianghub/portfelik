import type { TransactionStatus } from "$lib/types";

export type CardBandId = "overdue" | "upcoming" | "draft" | "history";

const BAND_ORDER: readonly CardBandId[] = ["overdue", "upcoming", "draft", "history"];

type BandRow = {
  status: TransactionStatus;
  projected?: boolean;
  date?: string;
};

/** Status bands belong to the default date order. Search and any other sort stay one list. */
export function usesTransactionStatusBands(
  layout: "responsive" | "cards",
  sortKey: string,
  sortDirection: "asc" | "desc",
  defaultDirection: "asc" | "desc"
): boolean {
  return layout !== "cards" && sortKey === "date" && sortDirection === defaultDirection;
}

/** Overdue and drafts are not "coming up" and they are not history. */
export function transactionCardBand(tx: BandRow): CardBandId {
  if (tx.status === "overdue") return "overdue";
  if (tx.projected === true || tx.status === "upcoming") return "upcoming";
  if (tx.status === "draft") return "draft";
  return "history";
}

/** Soonest due date first inside overdue/upcoming bands. */
function sortBandSoonestFirst<T extends BandRow>(id: CardBandId, rows: T[]): T[] {
  if (id !== "overdue" && id !== "upcoming") return rows;
  return [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
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
    return bandRows && bandRows.length > 0
      ? [{ id, rows: sortBandSoonestFirst(id, bandRows) }]
      : [];
  });
  if (present.length <= 1) {
    const only = present[0];
    return [
      {
        id: only?.id ?? "history",
        titled: false,
        rows: only ? sortBandSoonestFirst(only.id, only.rows) : rows,
      },
    ];
  }
  return present.map((band) => ({ ...band, titled: true }));
}
