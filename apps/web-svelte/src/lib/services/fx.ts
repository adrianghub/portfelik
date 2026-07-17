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
 * Unknown/missing rate → `null` (fail closed — never pretend FX = 1).
 */
export function convertToPln(amount: number, currency: string, rates: FxRates): number | null {
  if (currency === "PLN") return amount;
  const rate = rates[currency];
  return rate ? amount * rate : null;
}

/** True when every item has a usable PLN rate (PLN itself always counts). */
export function canConvertAllToPln(
  items: ReadonlyArray<{ currency: string }>,
  rates: FxRates | null | undefined
): boolean {
  // PLN-only bags never need an FX fetch — show them while rates load or fail.
  if (items.every((it) => it.currency === "PLN")) return true;
  if (!rates) return false;
  return items.every((it) => it.currency === "PLN" || !!rates[it.currency]);
}

/** Rates bag for conversion; PLN-only callers may pass null. */
export function ratesForPlnConversion(rates: FxRates | null | undefined): FxRates {
  return rates ?? { PLN: 1 };
}
