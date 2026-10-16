/**
 * Lowest forecast balance and the first date it occurs.
 * Used by Kokpit ("kiedy saldo będzie najniższe") and Analizy month detail.
 */
export interface ForecastTrough {
  date: string;
  balance: number;
}

export function forecastTrough(
  points: readonly { date: string; balance: number }[]
): ForecastTrough | null {
  if (points.length === 0) return null;
  let best = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    if (point.balance < best.balance) best = point;
  }
  return { date: best.date.slice(0, 10), balance: best.balance };
}
