# Portfelik — Product Review

**Date:** 2026-06-09
**Trigger:** User-requested deep pass on the Plans feature + Dashboard/Transactions/Settings for inconsistencies, calculation-logic gaps, UX/intent alignment, and core-loop coherence.
**Prior review:** `docs/PRODUCT_REVIEW_2026-06-07.md` (pre-launch readiness pass)

---

## Executive Summary

The app is in strong shape post-launch-freeze: the import→organize→intent→settle→condition loop exists end-to-end, the settlement surface is genuinely intent-oriented (ranked suggestions with human-readable reasons), and test coverage is broad (60+ vitest specs, 8 Playwright suites, full RLS matrix). Biggest strength: **the settlement flow is the best embodiment of the north star** — it links reality to intent instead of forcing manual truth. Most urgent gap: the **save-pace and debt-balance calculations rest on coarse heuristics that can silently mislabel a plan as "on track"** and the **surplus formula trusts an unverified assumption that debt payments already live inside tracked expenses** — both quietly corrupt the one number users will trust most. Recommended next action: tighten the three financial heuristics (save pace, debt consolidation order, surplus double-count guard) and add an explanation/uncertainty marker where the number is an estimate, before inviting beta couples.

---

## Closed since last review (2026-06-07)

The prior review's urgent gaps were operational and have largely closed per `CLAUDE.md`:

- Production-readiness stack (tx co-owner migration, export test, doc syncs) committed/pushed and promoted `dev`→`main` (2026-06-07/08).
- Launch certification 2026-06-08: gates green, manual prod/staging verification done, feature freeze in effect.
- Trust hardening landed (#111/#112): ledger-vs-forecast cashflow, plan settlement policy, shared-tx write gates.
- Group plans G2 (co-owner write gates) and Net worth D2 (surplus card, Pulpit strip) shipped.

**Still open from 06-07:** leaked-password protection toggle (prod+staging, operator), `pg_net` in `public` schema (re-enable via Dashboard on cloud).

---

## A. Feature Completeness  `8/10`

Plans ships three kinds (spend/save/debt) with first-class storage, settlement, debt amortization, Belka overpay-vs-invest scenarios, surplus card, and net-worth strip. All product-spine routes (Pulpit, Transakcje, Import, Plany, Ustawienia) are reachable from `Navigation.svelte` on mobile and desktop. Legacy `/shopping-lists` routes are clean 301 redirects to `/plans` — no orphans. Settlement, scenarios, and per-kind detail screens all exist.

**Gaps:**
- **Plans nav icon is still `ShoppingBasket`** (`Navigation.svelte:32,38`) — a shopping-list metaphor that no longer matches spend/save/debt intent. Visual lie about what the section is.
- **Dashboard upcoming transactions are passive** — read-only cards, no inline "mark paid"/quick-settle; the user must navigate to a filtered `/transactions` view to act, breaking the settle loop at its most natural trigger point.
- **No inline single-tap settle from a transactions row** — single-item settlement is hidden behind the detail sheet; bulk status change is multi-step (select → action bar).
- Offline write queue (Dexie outbox) still a known parity gap vs legacy `FirestoreService` (backlog, deferred).

---

## B. Test Coverage  `8/10`

Strong. Every financial service has a unit spec (`plan-debt`, `financial-surplus`, `planning-queue`, `plan-settlement`, `plan-settlement-policy`, `debt-amortization`, `dashboard-daily`, `transaction-cashflow`). Full RLS regression matrix incl. `plans`, `plan_debt_terms`, `plan_settlement`, group co-owner roles. Playwright covers plans, plan-settle, group-roles, bank-import, a11y spine.

**Gaps:**
- The **heuristic branches** are the risk, not the happy path: `computeSaveMonthlyActual` lump-sum-vs-recurring fallback and `consolidateDebtLinkedPayments` mixed dated/undated path need explicit unit cases that assert the *misleading* outcome is handled.
- No Playwright spec exercises the **save-plan "on track" badge** flipping with deposit timing, nor the **surplus headline** switching meaning when save goals exist.
- Dashboard drill-down / quick-settle has no E2E (because the affordance doesn't exist yet).

---

## C. Development Workflow  `8/10`

Branch-sync discipline is documented and visible in recent history (dev synced from main, e2e mock anchored to today). Conventional commits, migration-per-concern discipline, gates defined. CI present.

**Gaps:**
- `apps/web-svelte/CLAUDE.md` "Immediate next step" handoff is **stale at the app level** (see H) — a cold-starting agent would be misled about how Plans is stored.
- Did not verify CI runs `format:check` / secret-scan in this pass (user-directed focus was product/UX); the prior 06-07 review confirmed both gates exist.

---

## D. Security  `8/10`

Group writes go through SECURITY DEFINER RPCs; RLS matrix is comprehensive incl. `function_execute_hardening` and `max_user_cap`. Co-owner plan/debt write gates tested. No secret-leak signal in changed plan files.

**Gaps:**
- SECURITY DEFINER `search_path`-pin audit not re-run this pass (product-focused); 06-07 flagged 3 unpinned privacy functions — confirm closed before beta.
- Leaked-password advisor toggle (prod+staging) still operator-pending.

---

## E. Backend Patterns & Database  `7/10`

Money handled as numeric, balances rounded to cents (`Math.round(balance*100)/100`). Amortization stop-conditions guard negative amortization (`payment <= interest + 0.01`). Settlement scoring is deterministic and explainable.

**Calculation gaps (the core of this review):**
- **Surplus double-count assumption (`financial-surplus.ts`).** `computeMonthlySurplus` comments "Raty kredytów nie odejmujemy ponownie — są już w wydatkach," but performs **no check** that debt payments are actually inside `totalExpenses`. If a user pays a loan from an untracked account, or only links it as a plan, `afterSaveGoals` over-reports free capacity — the single most-trusted number is silently wrong. Add a reconciliation guard or surface the assumption.
- **Save-pace heuristic (`plan-settlement.ts` `computeSaveMonthlyActual`).** Fallback divides `savedAmount / elapsedMonths`. A lump-sum upfront deposit inflates the implied monthly pace → plan wrongly marked "on track" → `planning-queue` suppresses the save suggestion → user under-saves while the UI says they're fine. Distinguish recurring deposits from one-off, or label the figure as an estimate.
- **Debt consolidation order (`plan-debt.ts` `consolidateDebtLinkedPayments`).** When linked payments mix dated and undated rows, code falls back to an ungrouped `sorted.map(e => e.amount)` path, abandoning monthly grouping. Amortization applied as several small payments vs one grouped payment yields a different derived balance. Make the mixed case deterministic.
- **Compounding mismatch (`debt-amortization.ts`).** Period amortization compounds monthly; `accrueBalanceWithDailyInterest` compounds daily `(1+dailyRate)^days`. Most PL mortgages/loans compound monthly — daily accrual slightly inflates interest between payment dates. Acceptable for display, but document it as an estimate so the two paths don't disagree visibly.
- **Queue picks only the first off-track save/debt plan** (`planning-queue.ts`) — a plan off by 1% can outrank one off by 99% depending on `monthlyNeeded` sort. Rank by shortfall severity, not just magnitude.

**DB note (verified consistent):** net-worth liability excludes upcoming debt plans (product call; the brief `c39814b` inclusion was reverted), and surplus/queue use active-only buckets — so majątek netto and surplus tell a consistent story. No action.

---

## F. Frontend Patterns & Svelte  `7/10`

Svelte 5 runes throughout, design tokens (oklch, accent-gradient, tabular-nums), UI primitives reused, loading skeletons + multi-variant empty states on Transactions, casual Polish copy that is genuinely warm ("Pasuje świetnie", "Nie widzisz tu swojego wydatku? Dodaj ręcznie"). Settlement reasons are exemplary explanation-layer UX.

**Inconsistency gaps:**
- **PlanCard progress is asymmetric across kinds** (`PlanCard.svelte`). Save shows `savePct` (clamped `min(100)`), spend shows `spentPct` (amber at ≥90%), but **debt shows monthly payment on the right rail instead of a percentage**, and `debtPaidPct` is **not clamped to 100** (save is). Three kinds, three different right-rail semantics — harder to scan a mixed list.
- **SurplusCard headline silently changes meaning** (`SurplusCard.svelte:15`): shows `afterSaveGoals` when `hasSaveGoals`, else `surplus`. Same prominent number means "free cash" or "free cash after goals" with only a copy-string difference — a trust risk on the headline figure.
- **Group-filter state is inconsistent across screens**: Dashboard uses URL params, Transactions uses local state → group context is lost when navigating between them.
- **Permission blindness**: `canManageTransaction` silently hides edit/delete with no "why" — violates the doctrine's explanation layer ("explain at trust moments").
- Dashboard has **no visible error state** (relies on TanStack defaults) while Transactions has an explicit one — inconsistent failure UX.

---

## G. Architecture & Structure  `8/10`

Clean layering: route page → service → Supabase. Plan logic is well-decomposed into single-purpose services (`plans`, `plan-debt`, `financial-surplus`, `planning-queue`, `plan-settlement`, `plan-settlement-policy`, `debt-amortization`). Static-adapter constraint respected (redirects via `+page.ts` load, no `+server.ts`).

**Gaps:**
- `plans/+page.svelte` is **999 lines** and `plans/[id]/+page.svelte` is **626** — the create/edit form + kind picker + query orchestration are concentrated in the route file. Extracting a `PlanForm` component (the form is currently inline) would cut size and let the kind picker be tested in isolation.
- Surplus/net-worth condition logic is split across `/plans` (SurplusCard) and `/dashboard` (NetWorthStrip, PlanProgress) — two homes for "financial condition," risk of divergence.

---

## H. Documentation  `6/10`

Root `CLAUDE.md` phase table and product spine are current and detailed. Product-direction + intent-oriented-ui docs are excellent and genuinely usable as a review rubric.

**Gaps (doc rot — highest in this dimension):**
- **`apps/web-svelte/CLAUDE.md` is stale and actively misleading.** It still lists `shopping-lists.ts` as "current internal service for user-facing Plans," references `complete_shopping_list` RPC and `ShoppingList*` types as the Plans backbone. The code has moved to first-class `plans.ts` / `plan-debt.ts` / `plan-settlement.ts`. The svelte-gotchas file's gotcha #4 (`complete_shopping_list` returns a transactions row) is also obsolete. A cold-starting agent would build against the wrong storage model.
- `docs/architecture/database.md` currency with `plans`, `plan_debt_terms`, `plan_transaction_links` not verified this pass — check it reflects the first-class Plans schema.
- *(Process note: this review's own file was nearly lost to a stale sandbox-overlay write; verify generated docs land on real disk.)*

---

## I. Roadmap & North Star  `8/10`

North star = spending visibility + shared household expenses, mobile-first, minimal friction. The backlog serves it. Settlement is the strongest north-star artifact in the app: deterministic engine + intent memory + explanation layer + user-decides-exceptions, exactly per doctrine. The debt **scenarios** screen (Belka overpay-vs-invest, daily accrual) is the one place where complexity may outrun the *typical* target user — but for mortgage-holding couples it is a genuine differentiator. Keep it; just don't polish it before the basic surplus number is honest.

**Priority order:** (1) make the trusted numbers honest (surplus guard, save pace, debt consolidation), (2) close the settle loop at the trigger points (dashboard/transactions quick-settle), (3) fix cross-screen inconsistencies (nav icon, group-filter state, progress semantics), (4) then resume advanced scenario polish.

**Highest-impact next feature:** inline quick-settle from Dashboard upcoming + Transactions row — it closes the loop at the exact moment the user sees reality meet intent, which is the whole product thesis.

---

## Scorecard

| Dimension              | Score | Key finding |
|------------------------|-------|-------------|
| Feature completeness   | 8/10  | Loop complete; settle not triggerable where intent appears (dashboard/tx row) |
| Test coverage          | 8/10  | Broad; heuristic branches under-tested for the *misleading* case |
| Dev workflow           | 8/10  | Disciplined; app-level handoff doc stale |
| Security               | 8/10  | RLS strong; search_path + advisor re-check pending |
| Backend patterns       | 7/10  | Surplus double-count assumption + save-pace + debt-consolidation heuristics can silently mislead |
| Frontend patterns      | 7/10  | Per-kind progress semantics inconsistent; surplus headline meaning shifts |
| Architecture           | 8/10  | Clean layering; 999-line plans route + split condition logic |
| Documentation          | 6/10  | `apps/web-svelte/CLAUDE.md` describes retired shopping-list storage as current |
| North star alignment   | 8/10  | Settlement is exemplary; scenarios risk outrunning typical user |
| **Overall**            | **7.6/10** | Healthy, near-launch; tighten the numbers users trust before beta |

---

## Action Checklist

### Must close before any new feature
- [x] **Surplus double-count guard** — in `financial-surplus.ts` `computeMonthlySurplus`, either verify debt payments are inside `totalExpenses` or stop assuming it; surface "estimate" when unverifiable. This number drives every condition surface.
- [x] **Save-pace honesty** — `plan-settlement.ts` `computeSaveMonthlyActual`: stop letting a lump-sum inflate the monthly pace into a false "on track" badge; distinguish recurring vs one-off, or label as estimate.
- [x] **Debt consolidation determinism** — `plan-debt.ts` `consolidateDebtLinkedPayments`: define one deterministic order for the mixed dated/undated case; add a unit test asserting the derived balance.
- [x] **Fix `apps/web-svelte/CLAUDE.md`** — replace shopping-list service/RPC/type references with the first-class Plans model (`plans.ts`, `plan-debt.ts`, `plan-settlement.ts`); remove obsolete gotcha #4.

### High value, low overengineering risk
- [x] Inline quick-settle from Dashboard upcoming + a single-tap settle on Transactions rows (closes the loop at the intent moment).
- [x] Swap Plans nav icon off `ShoppingBasket` to a target/goal metaphor (`Navigation.svelte:32,38`).
- [x] Unify group-filter state (URL param) across Dashboard and Transactions so context survives navigation.
- [x] Make PlanCard right-rail semantics consistent across spend/save/debt; clamp `debtPaidPct` to 100.

### Medium term
- [ ] Extract `PlanForm` out of the 999-line `plans/+page.svelte`; test the kind picker in isolation.
- [ ] Add an explanation/disabled-state for permission-gated transaction edit (doctrine: explain at trust moments).
- [ ] Add Dashboard error state to match Transactions.
- [ ] Document daily-vs-monthly compounding as display-estimate in `debt-amortization.ts`.
- [ ] Rank planning-queue by shortfall severity, not first-plan magnitude.

### Consciously deferred (and why)
- Offline write queue (Dexie outbox) — last-write-wins decided, no current UX failure; safe to defer.
- Auto net-worth from import — manual snapshot ships value now; automation is polish.
- Belka invest-vs-overpay scenario polish — already shipped; defer further depth until the basic trusted numbers are hardened (avoid overengineering ahead of trust).

---

## Update 2026-06-09 (implementation)

All four must-close items closed and committed; surplus now wires real `debtPaymentsInExpenses` from current-month linked debt expenses on `/plans` (verified math when progress loads, estimate marker until then). planning-queue now treats `historical-average` save pace as no current-month pace so a lump sum no longer suppresses the warn chip. Quick-settle shipped on Dashboard upcoming + Transactions rows (mark-paid, optimistic, undo toast, permission-gated) with a Playwright case. Gates: svelte-check 0/0, eslint 0 errors, unit 160 passed, e2e transactions 15 passed.

---

*Generated by `/reflect` on 2026-06-09. Update CLAUDE.md "Immediate next step" after closing must-close items.*
