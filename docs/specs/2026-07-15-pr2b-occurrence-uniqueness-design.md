# PR 2B — Recurrence occurrence logical uniqueness (execution spec)

Status: implemented locally. Scope: dedup existing rows, replace per-actor uniqueness with template-scoped logical uniqueness, update all conflict targets.

## Goal

Group members must not materialize duplicate rows for the same `(recurring_template_id, recurring_occurrence_date)` slot. Template UUID already identifies series + scope.

## Deliverables

### Migration (`20260803040000_recurring_occurrence_logical_uniqueness.sql`)

1. **Dedup pass** for existing duplicate slots:
   - Survivor order: `paid` → `overdue` → `upcoming` → `draft` → linked plan rows → template owner → oldest `created_at` → lowest `id`
   - Repoint `recurring_occurrence_skips.skipped_transaction_id`, `plan_transaction_links`, `transaction_import_links`, `notifications.data.transactionId`
   - Delete loser rows

2. **Constraints**
   - `transactions_recurring_slot_pairing_check` — template id and occurrence date are both null or both set
   - `transactions_recurring_occurrence_logical_unique` — `unique (recurring_template_id, recurring_occurrence_date)` (named constraint for PostgREST upsert)

3. **`process_recurring_transactions()`** — `ON CONFLICT ON CONSTRAINT transactions_recurring_occurrence_logical_unique DO NOTHING`

### Client

- `recurring-occurrences.ts` — `onConflict: "recurring_template_id,recurring_occurrence_date"`
- `recurring-series.ts` — same conflict key + `ignoreDuplicates: true`; fetch existing row when upsert returns nothing

### Tests

- `tests/rls/recurring_occurrence_uniqueness.spec.ts` — raw insert duplicate rejected (`23505`); second-member upsert-ignore leaves one row
- `tests/unit/recurring-series.spec.ts` — conflict key + existing-row fallback

## Deferred

- **2C** — atomic skip/end/materialize RPCs
- **2D** — Warsaw cron schedule + docs

## Gates

- `supabase db reset` through `20260803040000`
- svelte-check 0/0, lint 0, format clean
- unit + RLS suites green
