# PR 4C — Debt link/unlink balance sync (execution spec)

Status: implemented locally. Part of Phase 4 (atomic financial writes).

## Goal

Make debt settlement atomic: linking or unlinking an expense must refresh
`plan_debt_terms.current_balance` in the same transaction as the link write.

## Root cause

Client did:
1. `link_plan_transaction` / `unlink_plan_transaction`
2. Separate `applyDebtBalanceFromLinks` → direct `plan_debt_terms` UPDATE

Failures left stale balances. Group **members** can settle but often cannot
UPDATE `plan_debt_terms` (owner/co-owner RLS) — member settle silently failed
balance sync.

## Deliverables

### Migration (`20260803120000_debt_link_balance_sync.sql`)

1. **`sync_debt_current_balance_from_links(plan_id)`** — SECURITY DEFINER port of
   TS `liveBalance` / `reanchorWithPayment` (snapshot + linked expenses ≤ today).
2. **`link_plan_transaction` / `unlink_plan_transaction`** call the helper when
   `plans.kind = 'debt'`. Save plans unchanged.

### Client

- Settle page, plan detail (confirm/unlink), transaction sheet: drop post-link
  balance writes; invalidate debt-terms queries.
- Manual sync button uses `syncDebtBalanceFromLinks` RPC.
- Pre-anchor toast on settle page kept (UX only).

### Tests

- `tests/rls/debt_link_balance_sync.spec.ts` — link/unlink balance, save-plan
  noop, group member DEFINER sync.

## Gates

- `supabase db reset` through `20260803120000`
- svelte-check 0/0, lint, format
- unit + RLS green

## Deferred

- Demo seed/clear atomicity
- Broader `mutateAsync` audit
- Full schedule amortization in SQL (not needed — cache is liveBalance)
