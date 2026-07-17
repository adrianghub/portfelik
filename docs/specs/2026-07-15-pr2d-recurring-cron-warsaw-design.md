# PR 2D — Recurring cron Warsaw date + isolation (execution spec)

Status: implemented locally. Closes Phase 2 (recurrence rewrite).

## Goal

- Due-day math uses product-local **Europe/Warsaw** date, not DB `current_date`.
- Cron schedule prefers Warsaw midnight when `cron.job.timezone` is available.
- One malformed template cannot abort the rest of the run.
- Refresh architecture docs that still described reminder-only / no materialization.

## Deliverables

### Migration (`20260803060000_recurring_cron_warsaw_isolation.sql`)

- `product_local_date(p_at timestamptz default now())` → `(timezone('Europe/Warsaw', p_at))::date`
- `process_recurring_transactions()`:
  - Uses `v_today := product_local_date()`
  - Still delegates due-day detection to `recurring_occurrence_on_date` (end date, phase, anchor floor)
  - Each template wrapped in `BEGIN … EXCEPTION WHEN OTHERS … WARNING … END`
- Reschedule:
  - If `cron.job.timezone` exists: `5 0 * * *` + `timezone = Europe/Warsaw`
  - Else fallback: `5 23 * * *` UTC (date math still Warsaw)

### Docs

- `docs/architecture/flows/recurring-transactions.md` — rewritten for materialize+remind, shared primitive, Warsaw schedule, series RPCs
- `supabase/CLAUDE.md` — cron table updated

### Tests

- `tests/rls/recurring_cron_warsaw.spec.ts` — Warsaw date (Jul 15 22:30 UTC → Jul 16); materializes monthly due template on `product_local_date()`

## Gates

- `supabase db reset` through `20260803060000`
- svelte-check 0/0, lint 0, format clean
- unit 390/390, RLS 349/349

## Phase 2 complete

| PR | Status |
|---|---|
| 2A Primitive + parity fixtures | done |
| 2B Logical uniqueness | done |
| 2C Atomic series RPCs | done |
| 2D Cron Warsaw + isolation + docs | done |
