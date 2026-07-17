# PR 4A — Atomic net-worth save RPC (execution spec)

Status: implemented locally. Part of Phase 4 (atomic financial writes).

## Goal

Replace three sequential client writes (snapshot → cash anchor → items with
delete-before-upsert) with one transactional RPC so partial failures cannot
lose assets or leave inconsistent anchors.

## Root cause

`/plans` `snapshotMutation` called:
1. `upsertFinancialSnapshot`
2. `upsertPrivateCashPosition`
3. `saveNetWorthItems` — **DELETE orphans before UPSERT**

Any failure after step 1 or after delete permanently corrupts net-worth state.

## Deliverables

### Migration (`20260803100000_save_net_worth_snapshot_rpc.sql`)

`save_net_worth_snapshot(p_as_of_date, p_opening_amount, p_items jsonb)`:

1. Validate all items (skip blank labels; currency allowlist PLN/EUR/USD/GBP/CHF).
2. Upsert `financial_snapshots` (legacy amount cols → 0).
3. Upsert private `cash_positions` (`ON CONFLICT (owner_id)`).
4. Upsert `net_worth_items` (update by id or insert).
5. **Delete orphans last** — ids not in kept set.

Returns `{ snapshot, cash_position, items }` jsonb.

### Client

- `saveNetWorthSnapshot()` in `financial-snapshots.ts`.
- `/plans/+page.svelte` — single RPC in `snapshotMutation`.
- `saveNetWorthItems` retained for demo/direct paths (documented).

### Tests

- `tests/rls/save_net_worth_snapshot.spec.ts` — atomic save, orphan delete,
  rollback on bad item id / currency, anon denied.

## Gates

- `supabase db reset` through `20260803100000`
- svelte-check 0/0, lint, format
- unit + RLS green

## Deferred (4C+)

- Debt link/unlink + balance recalculation RPC — **see PR 4C** ✅
- Demo seed/clear atomicity
- `mutateAsync` audit across dialogs
- Revoke direct table writes on save path
