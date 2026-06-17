# Handover — Debt-engine simplification + refinance (2026-06-17)

Branch: `feat/debt-engine-simplification` — 13 commits, **based directly on current `origin/dev`** (zero conflicting/overlapping files; dev's tree == this branch's merge-base, so integration is a clean fast-forward). **Not yet pushed / not on dev or prod.** Gates green at HEAD `b28d461` (svelte-check 0/0, lint 0 err + 5 pre-existing generated-paraglide warnings, format clean, unit 220/220, RLS 266/266, E2E plans+settle 13/13, extension-in-public advisor OK, secret scan clean).

## What shipped on this branch

- **Single pure debt engine** `services/debt-schedule.ts` replaces the old 3-path daily-compounding reconciliation. Balance steps **monthly only** (odd first-period gap interest on row 0, neg-amort guard) and re-anchors **only on real linked payments** — no daily tick. `debt-balance-replay.ts` deleted; `plan-debt.ts` delegates; 7 caller surfaces repointed.
- **First-payment terms** `plan_debt_terms.first_payment_date` / `first_payment_amount` (migration `20260710000000`, backfills date = `plans.start_date`). Models odd/larger opening installment off the loan agreement (e.g. 3115,38 then 2255,01).
- **Refinance = no-money flow** (migration `20260711000000` adds `plans.status` `active|refinanced|closed` + `refinanced_from_plan_id` / `replaced_by_plan_id`). `services/plan-refinance.ts::refinanceDebtPlan` inserts the new debt plan + terms, patches the old plan (`status=refinanced`, links replacement), rolls back the new plan on failure (terms cascade via FK), writes **zero transactions** (cash wash nets to zero).
- **UI**: first-payment fields in the debt create/edit form; "Refinansuj kredyt" accordion (submit "Otwórz nowy kredyt") + lineage badges in `DebtPlanDetail`; parent route fills owner/scope via `getUser()`, navigates to the new plan.

## ✅ RESOLVED — refinanced plans no longer double-count (commit `9103a39`)

Was: `plans.status` had no read-side consumer; bucketing (`derivePlanBucket`, `isActivePlan`) is date-only, so a refinanced old plan (future `end_date`, positive balance) still read as `active` and double-counted with its replacement in net worth, monthly obligations, and the hub debt list.

Fix: added `isLivePlan(plan)` = `status === "active"` in `services/plans.ts`, applied in `collectNetWorthDebtBalances`, `sumDebtMonthlyPayments`, the `planning-queue` debt chip, and the hub debt list + observed-coverage sum (`routes/plans/+page.svelte`). Unit tests cover the refinanced-exclusion in all three pure functions (223 unit total); E2E mock fixtures now carry `status` so the hub keeps rendering live debt plans (plans E2E 7/7). `fetchPlans` still selects `*` (no server filter) — gating is purely read-side.

Possible follow-on (optional): surface refinanced/closed plans in an "archived" hub section instead of hiding them (they remain reachable via the lineage badge on the replacement plan).

## Secondary review notes

- **`status:'closed'` has no producer.** Defined in the enum + types but nothing ever sets it. Decide its role (debt fully paid → closed? save goal reached?) or document that only `refinanced` is wired for now.
- **Refinance atomicity** is client multi-statement with best-effort rollback (delete new plan on failure). If the rollback delete itself fails, an orphan new plan can linger. Acceptable for beta; for hardening, move to a `SECURITY DEFINER` RPC `refinance_debt_plan` doing insert + patch in one transaction.
- **Old plan after refinance** stays fully editable/settleable. Consider gating writes (or truncating its `end_date` to the refinance date) so historical state is clean. Design call, not a blocker.
- **Engine asymmetry (intentional, not a bug):** display balance replays *actual* linked payments (`liveBalance`); interest-paid reads the *contract schedule* (`interestPaidThrough`). Real-owed vs. estimate — consistent with the "engines estimate, real data corrects" doctrine.
- **Bug already fixed this branch** (`b28d461`): `upsertPlanDebtTerms` used to wipe `first_payment_*` when callers omitted them (DebtPlanDetail terms-edit / full-replay). Now preserves stored values unless an explicit value (incl. null) is passed. Covered by 3 chained-mock unit tests.

## Deploy / promotion notes

- Per branch flow: PR target is `dev`; merge latest `origin/dev` before pushing (currently a no-op — already based on it).
- **Migrations `20260710000000` + `20260711000000` must be applied to prod Supabase on promotion** (and staging via the `dev` CI migrate leg). Timestamps exceed the latest applied (`20260705000000`).
- Local DB already has both applied (`supabase db reset`); backfill verified via psql (`first_payment_date = start_date`).

## Key files

- Engine: `apps/web-svelte/src/lib/services/debt-schedule.ts` (+ `tests/unit/debt-schedule.spec.ts`)
- Terms/CRUD: `apps/web-svelte/src/lib/services/plan-debt.ts` (+ `tests/unit/plan-debt.spec.ts`)
- Refinance: `apps/web-svelte/src/lib/services/plan-refinance.ts` (+ `tests/unit/plan-refinance.spec.ts`)
- UI: `components/plans/DebtPlanDetail.svelte`, `routes/plans/+page.svelte`, `routes/plans/[id]/+page.svelte`
- Aggregates to fix: `services/financial-snapshots.ts`, `services/financial-surplus.ts`, `services/planning-queue.ts`
- Migrations: `supabase/migrations/20260710000000_debt_first_payment.sql`, `20260711000000_plans_refinance_links.sql`
- RLS: `apps/web-svelte/tests/rls/plans_refinance.spec.ts`
- E2E: `apps/web-svelte/e2e/tests/plans.spec.ts` (refinance case)
