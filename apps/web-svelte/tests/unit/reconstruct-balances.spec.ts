import { describe, expect, it } from "vitest";
import { forecastPosition, livePosition } from "$lib/services/cash-position";
import {
  reconstructHistoricalBalances,
  type HistoricalBalanceTx,
} from "$lib/services/reconstruct-balances";

function tx(
  partial: Partial<HistoricalBalanceTx> & Pick<HistoricalBalanceTx, "id" | "date" | "amount">
): HistoricalBalanceTx {
  return {
    type: "expense",
    status: "paid",
    currency: "PLN",
    ...partial,
  };
}

const confirmed = {
  opening_amount: 12_000,
  as_of_date: "2026-10-13",
  balance_semantics: "end_of_day" as const,
};

describe("reconstructHistoricalBalances", () => {
  const history = [
    tx({ id: "jul", date: "2026-07-31", amount: 1_500, type: "income" }),
    tx({ id: "aug", date: "2026-08-31", amount: 700 }),
    tx({ id: "sep", date: "2026-09-30", amount: 1_200, type: "income" }),
    tx({ id: "oct", date: "2026-10-13", amount: 1_000, type: "income" }),
    tx({ id: "later", date: "2026-10-20", amount: 50, type: "income" }),
    tx({ id: "plan", date: "2026-10-21", amount: 80, status: "upcoming", type: "income" }),
    tx({ id: "late", date: "2026-09-15", amount: 40, status: "overdue" }),
    tx({ id: "eur", date: "2026-08-02", amount: 2_000, currency: "EUR", type: "income" }),
  ];

  it("rebuilds the imported history from one end-of-day balance", () => {
    const series = reconstructHistoricalBalances({
      anchor: confirmed,
      transactions: history,
      from: "2026-07-01",
      to: "2026-10-13",
    });

    expect(series.semantics).toBe("end_of_day");
    expect(series.confirmedDate).toBe("2026-10-13");
    expect(series.confirmedAmount).toBe(12_000);
    expect(series.points.find((point) => point.date === "2026-10-13")).toMatchObject({
      amount: 12_000,
      quality: "confirmed",
    });
    expect(series.points.find((point) => point.date === "2026-09-30")).toMatchObject({
      amount: 11_000,
      quality: "reconstructed",
    });
    expect(series.points.find((point) => point.date === "2026-08-31")).toMatchObject({
      amount: 9_800,
      quality: "reconstructed",
    });
    expect(series.points.find((point) => point.date === "2026-07-31")).toMatchObject({
      amount: 10_500,
      quality: "reconstructed",
    });
    expect(series.points.find((point) => point.date === "2026-07-30")).toMatchObject({
      amount: 9_000,
      quality: "reconstructed",
    });
    expect(series.points.some((point) => point.date < "2026-07-30")).toBe(false);
    expect(series.points.some((point) => point.date === "2026-01-01")).toBe(false);
    expect(series.reconstructed).toBe(true);
    expect(series.excludedForeignCurrency).toBe(true);
    expect(series).not.toHaveProperty("confidence");
  });

  it("keeps the same anchor for dates after the confirmation", () => {
    const series = reconstructHistoricalBalances({
      anchor: confirmed,
      transactions: history,
      from: "2026-10-13",
      to: "2026-10-20",
    });
    expect(series.points.find((point) => point.date === "2026-10-13")?.amount).toBe(12_000);
    expect(series.points.find((point) => point.date === "2026-10-20")).toMatchObject({
      amount: 12_050,
      quality: "booked",
    });
    expect(livePosition(confirmed, history)).toBe(12_050);
    expect(
      forecastPosition(confirmed, history, { today: "2026-10-13", horizonEnd: "2026-10-31" })
    ).toBe(12_130);
  });

  it("does not count confirmation-day rows twice, including several rows and timestamps", () => {
    const rows = [
      tx({ id: "b", date: "2026-10-13T23:30:00.000Z", amount: 40, type: "income" }),
      tx({ id: "a", date: "2026-10-13", amount: 100 }),
      tx({ id: "next", date: "2026-10-14", amount: 10, type: "income" }),
    ];
    const series = reconstructHistoricalBalances({
      anchor: confirmed,
      transactions: rows,
      from: "2026-10-13",
      to: "2026-10-14",
    });
    expect(series.points.find((point) => point.date === "2026-10-13")?.amount).toBe(12_000);
    expect(series.afterTransaction.get("a")).toBe(11_960);
    expect(series.afterTransaction.get("b")).toBe(12_000);
    expect(series.points.find((point) => point.date === "2026-10-14")?.amount).toBe(12_010);
    expect(livePosition(confirmed, rows)).toBe(12_010);
  });

  it("carries the balance across a month with no transactions", () => {
    const series = reconstructHistoricalBalances({
      anchor: confirmed,
      transactions: [tx({ id: "aug", date: "2026-08-31", amount: 700 })],
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(series.points).toEqual([
      expect.objectContaining({ date: "2026-09-01", amount: 12_000, quality: "reconstructed" }),
      expect.objectContaining({ date: "2026-09-30", amount: 12_000, quality: "reconstructed" }),
    ]);
  });

  it("keeps grosze, zero, and a negative balance exact", () => {
    const grosze = reconstructHistoricalBalances({
      anchor: { opening_amount: 10.01, as_of_date: "2026-10-13", balance_semantics: "end_of_day" },
      transactions: [tx({ id: "cent", date: "2026-10-12", amount: 0.01 })],
      from: "2026-10-11",
      to: "2026-10-13",
    });
    expect(grosze.points.find((point) => point.date === "2026-10-11")?.amount).toBe(10.02);
    expect(grosze.points.find((point) => point.date === "2026-10-13")?.amount).toBe(10.01);

    const negative = reconstructHistoricalBalances({
      anchor: { opening_amount: -20, as_of_date: "2026-10-13", balance_semantics: "end_of_day" },
      transactions: [],
      from: "2026-10-13",
      to: "2026-10-13",
    });
    expect(negative.points).toEqual([
      expect.objectContaining({ amount: -20, quality: "confirmed" }),
    ]);

    const zero = reconstructHistoricalBalances({
      anchor: { opening_amount: 0, as_of_date: "2026-10-13", balance_semantics: "end_of_day" },
      transactions: [],
      from: "2026-10-13",
      to: "2026-10-13",
    });
    expect(zero.points[0]?.amount).toBe(0);
    expect(zero.reconstructed).toBe(false);
  });

  it("ignores unpaid rows and a non-PLN currency without converting it", () => {
    const onlyForeign = reconstructHistoricalBalances({
      anchor: confirmed,
      transactions: [
        tx({ id: "eur", date: "2026-10-01", amount: 2_000, currency: "EUR", type: "income" }),
        tx({ id: "soon", date: "2026-10-01", amount: 500, status: "upcoming", type: "income" }),
        tx({ id: "draft", date: "2026-10-01", amount: 500, status: "draft", type: "income" }),
      ],
      from: "2026-09-30",
      to: "2026-10-13",
    });
    expect(onlyForeign.points.every((point) => point.amount === 12_000)).toBe(true);
    expect(onlyForeign.excludedForeignCurrency).toBe(true);
    expect(onlyForeign.historyStart).toBeNull();
  });

  it("changes when a historical row or the anchor changes, and leaves legacy rows on start of day", () => {
    const legacy = { opening_amount: 1_000, as_of_date: "2026-06-01" };
    const rows = [
      tx({ id: "before", date: "2026-05-20", amount: 100 }),
      tx({ id: "same", date: "2026-06-01", amount: 100 }),
    ];
    const original = reconstructHistoricalBalances({
      anchor: legacy,
      transactions: rows,
      from: "2026-05-19",
      to: "2026-06-01",
    });
    expect(original.confirmedDate).toBe("2026-05-31");
    expect(original.points.find((point) => point.date === "2026-05-31")?.amount).toBe(1_000);
    expect(original.points.find((point) => point.date === "2026-05-20")?.amount).toBe(1_000);
    expect(original.points.find((point) => point.date === "2026-05-19")?.amount).toBe(1_100);
    expect(livePosition(legacy, rows)).toBe(900);

    const withoutOldRow = reconstructHistoricalBalances({
      anchor: legacy,
      transactions: rows.filter((row) => row.id !== "before"),
      from: "2026-05-19",
      to: "2026-06-01",
    });
    expect(withoutOldRow.points.find((point) => point.date === "2026-05-19")).toBeUndefined();

    const edited = reconstructHistoricalBalances({
      anchor: { ...legacy, opening_amount: 2_000, as_of_date: "2026-06-15" },
      transactions: rows,
      from: "2026-05-19",
      to: "2026-06-15",
    });
    expect(edited.confirmedDate).toBe("2026-06-14");
    expect(edited.confirmedAmount).toBe(2_000);
    expect(livePosition(legacy, rows)).toBe(900);
  });

  it("uses an earlier import only for reconstruction, not for the live balance", () => {
    const rows = [tx({ id: "old", date: "2026-07-01", amount: 200, type: "income" })];
    expect(livePosition(confirmed, rows)).toBe(12_000);
    const series = reconstructHistoricalBalances({
      anchor: confirmed,
      transactions: rows,
      from: "2026-06-30",
      to: "2026-10-13",
    });
    expect(series.points.find((point) => point.date === "2026-06-30")?.amount).toBe(11_800);
    expect(series.points.find((point) => point.date === "2026-10-13")?.amount).toBe(12_000);
  });
});
