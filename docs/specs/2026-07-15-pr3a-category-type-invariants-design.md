# PR 3A — Category type invariants (execution spec)

Status: implemented locally. Part of Phase 3 (DB invariants).

## Goal

Enforce `categories.type = transactions.type` at the database boundary, block
type flips on referenced categories, and stop mixed bulk selection from
applying the wrong category type in the UI.

## Deliverables

### Migration (`20260803070000_category_type_invariants.sql`)

1. **Backfill** mismatched ledger pairs → owner's Inne of `transactions.type`
   (`seed_default_categories` + `"Inne wydatki"` / `"Inne przychody"`).
2. **`enforce_transaction_category_type`** — `BEFORE INSERT OR UPDATE OF category_id, type`
   on `transactions`. Raises `category_type_mismatch` / `category_not_found`.
   - `SECURITY DEFINER` so group materialization can validate peer categories under RLS.
   - Trigger name `tx_enforce_transaction_category_type` so
     `lock_linked_transaction_type` fires first alphabetically.
3. **`prevent_referenced_category_type_change`** — `BEFORE UPDATE OF type` on
   `categories`. Raises `category_type_in_use` when any transaction or
   categorization rule references the row.

### Client

- `BulkActionsBar` — only shows category picker for homogeneous selections;
  filters categories by that type; mixed selection shows hint copy.
- `CategoryDialog` — locks type control when `isCategoryReferenced`; maps errors via `toastError`.
- `supabase-errors` — maps `category_type_mismatch` / `category_type_in_use`.
- Paraglide strings in `pl.json`.

### Tests

- `tests/rls/category_type_invariants.spec.ts` — insert/update mismatch; type flip blocked/allowed.
- Adjusted settlement / transactions RLS for paired type+category updates.
- Unit: error message mapping; node-safe session mocks for cache/notification specs.

## Gates

- `supabase db reset` through `20260803070000`
- svelte-check 0/0, lint 0, format clean
- unit 396/396, RLS 353/353

## Deferred

_(none — see 3B/3C)_
