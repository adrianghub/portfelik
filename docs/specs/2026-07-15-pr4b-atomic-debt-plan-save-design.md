# PR 4B — Atomic debt-plan save RPC (execution spec)

Status: implemented locally. Part of Phase 4 (atomic financial writes).

## Goal

Replace split debt-plan writes (create/update plan then upsert terms; detail
page terms then dates) with one transactional RPC.

## Root cause

- Hub create: `createPlan` + `upsertPlanDebtTerms` with best-effort `deletePlan` rollback
- Hub edit: `updatePlan` then terms — plan can update without terms
- Detail edit: terms via `mutateAsync`, dates via fire-and-forget `mutate`

## Deliverables

### Migration (`20260803110000_save_debt_plan_rpc.sql`)

`save_debt_plan(...)` — SECURITY INVOKER, RLS-enforced:

- `p_plan_id` null → create active debt plan + terms
- `p_plan_id` set → update plan + upsert terms (reject non-active)
- Validate name/dates/debt fields before write
- Reject date shrink when linked txs would fall outside period
- Anchor merge mirrors `upsertPlanDebtTerms` (reset/clear/preserve/fresh)

### Client

- `saveDebtPlan()` in `plan-debt.ts`
- `/plans` hub create/edit for debt kind
- `/plans/[id]` detail via `onDebtPlanSave` (atomic terms + dates)
- `demo-data.ts` debt seed

### Tests

- `tests/rls/save_debt_plan.spec.ts`

## Gates

- `supabase db reset` through `20260803110000`
- svelte-check 0/0, lint, format, unit + RLS green

## Deferred (4C+)

- Debt link/unlink + balance sync RPC
- `mutateAsync` audit elsewhere
- Revoke direct table writes on save path
