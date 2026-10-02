/** Sum ledger amounts in integer cents, converting only at the boundary. */
export function sumMoneyAmounts(rows: readonly { amount: number }[], initialAmount = 0): number {
  return (
    rows.reduce(
      (cents, row) => cents + Math.round(row.amount * 100),
      Math.round(initialAmount * 100)
    ) / 100
  );
}

export function moneyDifference(left: number, right: number): number {
  return (Math.round(left * 100) - Math.round(right * 100)) / 100;
}
