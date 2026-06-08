export type DebtSimMode = "monthly" | "lump";

export interface DebtSimUrlState {
  mode: DebtSimMode;
  extra: number;
  amount: number;
  invest: number;
}

export const DEBT_SIM_DEFAULTS: DebtSimUrlState = {
  mode: "monthly",
  extra: 500,
  amount: 10_000,
  invest: 7,
};

function parseBoundedNumber(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
  step = 1
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const snapped = step < 1 ? Math.round(n / step) * step : Math.round(n);
  return Math.min(max, Math.max(min, snapped));
}

export function parseDebtSimUrl(params: URLSearchParams): DebtSimUrlState {
  return {
    mode: params.get("mode") === "lump" ? "lump" : "monthly",
    extra: parseBoundedNumber(params.get("extra"), 0, 50_000, DEBT_SIM_DEFAULTS.extra, 50),
    amount: parseBoundedNumber(params.get("amount"), 0, 500_000, DEBT_SIM_DEFAULTS.amount, 500),
    invest: parseBoundedNumber(params.get("invest"), 0, 15, DEBT_SIM_DEFAULTS.invest, 0.5),
  };
}

export function debtSimQueryString(state: DebtSimUrlState, base?: URLSearchParams): string {
  const params = new URLSearchParams(base);
  params.set("mode", state.mode);
  params.set("extra", String(state.extra));
  params.set("amount", String(state.amount));
  params.set("invest", String(state.invest));
  return params.toString();
}

export function planDetailDebtSimUrl(pathname: string, searchParams: URLSearchParams): string {
  return `${pathname}?${debtSimQueryString(parseDebtSimUrl(searchParams), searchParams)}`;
}

export function scenariosHref(planId: string, state: DebtSimUrlState): string {
  return `/plans/${planId}/scenarios?${debtSimQueryString(state)}`;
}
