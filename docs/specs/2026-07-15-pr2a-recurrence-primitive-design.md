# PR 2A — Recurrence date primitive (execution spec)

Status: implemented locally. Scope: shared SQL + client recurrence math; cron delegates due-day detection. No atomic series RPCs (2C), no uniqueness migration (2B), no Warsaw cron schedule (2D).

## Goal

One canonical recurrence date algorithm used by:
- SQL `process_recurring_transactions()` (due-day materialization gate)
- Client `projectRecurringOccurrences()` / forecast surfaces

Parity is enforced by shared fixtures exercised in both Vitest unit tests and RLS RPC tests.

## Deliverables

### SQL (`20260803030000_recurring_occurrence_dates_primitive.sql`)

- `recurring_last_dom` / `recurring_clamp_dom` — month-length helpers
- `recurring_occurrence_dates(...)` → `date[]` — list occurrences in `(after_exclusive, before_exclusive)`; `anchor` inclusive minimum; `end_date` inclusive maximum; never before anchor
- `recurring_occurrence_on_date(...)` → `boolean` — due-day check wrapper
- `process_recurring_transactions()` refactored to call `recurring_occurrence_on_date` and honor `recurrence_end_date`

Grants: `authenticated`, `service_role` only (not `anon`).

### Client

- `src/lib/services/recurrence-dates.ts` — pure TS primitive (`recurringOccurrenceDates`, `recurringOccurrenceOnDate`)
- `src/lib/services/recurring-forecast.ts` — delegates `occurrenceDates()` to the primitive
- `tests/fixtures/recurrence-date-fixtures.ts` — shared fixture table

### Tests

- `tests/unit/recurrence-dates.spec.ts` — client primitive vs fixtures
- `tests/rls/recurring_occurrence_dates.spec.ts` — SQL RPC vs same fixtures
- Existing `tests/unit/recurring-forecast.spec.ts` unchanged behavior

## Fixture coverage

Monthly/weekly/daily/yearly, interval phase, exclusive bounds, end date, anchor floor, stale-anchor fast-forward, day-31 clamp, Feb 29 leap/non-leap.

## Deferred to later PRs

- **2B** — `(recurring_template_id, recurring_occurrence_date)` uniqueness + dedup
- **2C** — atomic skip/end/delete/materialize RPCs
- **2D** — Europe/Warsaw cron schedule, per-template error isolation, docs refresh

## Gates

- `supabase db reset` through `20260803030000`
- svelte-check 0/0, lint 0, format clean
- unit 390/390, RLS 341/341 (incl. +12 recurrence parity)
