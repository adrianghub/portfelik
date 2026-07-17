# PR5 — Financial display correctness

**Date:** 2026-07-16  
**Status:** implemented locally

## Problems

1. Missing FX rates treated foreign amounts as PLN 1:1.
2. Cash forecast mixed unbounded real `upcoming` rows with month-scoped projections; overdue excluded.
3. Same-day running balances had no stable tie-break.
4. Shared private categories showed false label `Inna kategoria`.
5. Recurring projections could omit today’s occurrence (exclusive `now` lower bound).
6. Dashboard recurring count ignored active scope; `forecast=recurring` was a dead URL param.

## Direction

- `convertToPln` returns `null` without a rate; net-worth surfaces fail closed with PL copy.
- Shared `CASH_FORECAST_HORIZON_DAYS` (90); `forecastPosition` / `forecastRunningBalances` include `upcoming` + `overdue` within that horizon; transactions cash strip projects over the same window from today.
- Running-balance sort: date, then id.
- View coalesce → `Kategoria niedostępna`.
- Projection span start uses day-before-today so today is included.
- Recurring chip uses scoped templates; drop dead `forecast=` query param from product links.
