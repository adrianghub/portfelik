# PR 3B — Plan lifecycle + linked-tx invariants (execution spec)

Status: implemented locally. Part of Phase 3 (DB invariants).

## Goal

Reject new settlement against non-`active` plans, keep historical links for
payment history, and lock linked transactions so `date` / `group_id` cannot
drift outside the plan period or scope after linking.

## Decisions

| Case | Behavior |
|---|---|
| Link/contribute to `refinanced` / `closed` | Reject with `plan_not_active` |
| Existing links on archived plans | Keep (history); unlink still allowed |
| Date/scope orphan links at migrate | Delete (corrupt invariant) |
| Post-link `date` / `group_id` edit that breaks period/scope | Reject (same error codes as link) |
| Post-link type edit | Already locked by `lock_linked_transaction_type` |

## Deliverables

### Migration (`20260803080000_plan_lifecycle_linked_tx_invariants.sql`)

1. **Audit delete** of date/scope orphan `plan_transaction_links`.
2. **`transaction_matches_plan_scope(plan, tx)`** shared predicate.
3. **`link_plan_transaction` / `add_plan_contribution`** require `plans.status = 'active'`.
4. **`lock_linked_transaction_plan_invariants`** — `BEFORE UPDATE OF date, group_id`
   on `transactions`; raises `transaction_outside_plan_period`,
   `group_scope_mismatch`, or `private_scope_mismatch`.

### Client

- `plan-settlement-policy` — `isTransactionEligibleForPlanSettlement` requires
  `status === 'active'`.
- `supabase-errors` + `pl.json` — `plan_not_active`, scope mismatch, type-lock copy.

### Tests

- Unit: non-active plan eligibility rejection.
- RLS (`plan_settlement.spec.ts`): non-active link/contribute; historical keep +
  unlink; post-link date/scope lock.

## Gates

- `supabase db reset` through `20260803080000`
- svelte-check 0/0, lint 0, format clean
- unit + RLS green for this slice

## Deferred

_(none — Phase 3 closed with 3C)_
- Plan period shrink that would orphan existing links (product decision later)
