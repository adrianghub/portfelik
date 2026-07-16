# PR 2C — Atomic recurring series RPCs (execution spec)

Status: implemented locally. Scope: transactional skip/end/materialize/prune/bulk-delete; client delegates to RPCs.

## Deletion policy ("this and future" + end-date shorten)

| Occurrence status | Action from boundary date onward |
|---|---|
| `upcoming` | Delete (generated unsettled slot) |
| `paid` | Detach (`recurring_template_id` + `recurring_occurrence_date` → null) |
| `draft` | Detach (preserve user-edited row) |
| `overdue` | Detach (ledger obligation preserved) |

## RPCs (`20260803050000_recurring_series_atomic_rpcs.sql`)

All `SECURITY INVOKER` unless noted; grants to `authenticated` + `service_role`.

| RPC | Purpose |
|---|---|
| `can_manage_transaction_actor` | SQL mirror of client `canManageTransaction` |
| `_prune_recurring_occurrences_from` | Internal prune helper |
| `skip_recurring_occurrence` | Skip memory + optional row delete (idempotent `ON CONFLICT DO NOTHING`) |
| `end_recurring_series_from_occurrence` | Set `recurrence_end_date` + prune |
| `prune_recurring_occurrences_from` | Prune after template end-date shorten (dialog) |
| `materialize_recurring_occurrence` | Upsert logical slot; return row id |
| `bulk_delete_transactions` | Per-row skip memory + delete in one transaction |

## Client wiring

- `recurring-series.ts` — skip/end/materialize/prune call RPCs
- `transactions.ts` — `deleteTransaction` / `deleteTransactions` → `bulk_delete_transactions`
- `transactions/+page.svelte` — removed duplicate skip-before-delete client orchestration

## Tests

- `tests/rls/recurring_series_atomic_rpcs.spec.ts` — idempotent skip, end-series prune policy, bulk delete skip memory, materialize returns existing slot
- `tests/unit/recurring-series.spec.ts` — RPC-based materialize mock

## Deferred

- **2D** — Europe/Warsaw cron + docs refresh

## Gates

- `supabase db reset` through `20260803050000`
- svelte-check 0/0, lint 0, format clean
- unit 390/390, RLS 347/347
