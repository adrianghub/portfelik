// FX rates to PLN via the National Bank of Poland public API (free, no key).
// Table A (mid rates) covers the major currencies; one fetch returns all of them.
// NBP responds with `Access-Control-Allow-Origin: *`, so the browser can call it
// directly. Rates are cached by TanStack Query (12h staleTime).

export const SUPPORTED_CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** code -> PLN value of one unit. PLN is always 1. */
export type FxRates = Record<string, number>;

const NBP_TABLE_A = "https://api.nbp.pl/api/exchangerates/tables/A?format=json";

interface NbpTable {
  rates: { code: string; mid: number }[];
}

export async function fetchPlnRates(): Promise<FxRates> {
  const res = await fetch(NBP_TABLE_A, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`nbp_${res.status}`);
  const json = (await res.json()) as NbpTable[];
  const rates: FxRates = { PLN: 1 };
  for (const r of json[0]?.rates ?? []) {
    rates[r.code] = r.mid;
  }
  return rates;
}

/**
 * Convert an amount in `currency` to PLN using `rates`. Pure.
 * Unknown/missing rate → returns the amount unchanged (best-effort, never throws),
 * so a transient FX gap can't blow up the net-worth total.
 */
export function convertToPln(amount: number, currency: string, rates: FxRates): number {
  if (currency === "PLN") return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}
