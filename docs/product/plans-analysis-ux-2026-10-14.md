# Plans + Analysis UX — design

**Status:** approved in conversation 2026-10-14; awaiting sign-off on this written spec  
**Branch:** `cursor/plans-analysis-ux-e8ce`  
**Approach:** Surgical (A) — fix broken plans/debt/upcoming paths; extend Analysis forecast with history-style flow bars + clearer category filters

## Problem

After 1.3.14, users report:

1. Cannot manually add/connect a transaction on a mortgage (debt) plan.
2. Linked transaction totals look correct on the plans list but wrong / missing on plan detail.
3. Save/spend plan detail UI (e.g. “visit Malta”, link existing, upcoming) feels broken.
4. Upcoming payments on Transactions sort farthest-first instead of soonest-first.
5. Analysis forecast lacks expense/income detail and bar charts like history.
6. Analysis category filters feel worthless / hard to understand.

## Goals

- Restore debt and save plan linking/contribution UX so users can settle plans again.
- Make list and detail headline totals use the same paid-settlement rules.
- Sort upcoming payments soonest-first (match Kokpit).
- Give forecast mode planned income/expense bars + a readable breakdown.
- Make category filters obviously affect flow visuals and copy, without filtering saldo.

## Non-goals

- Redesigning the entire Plans product or inventing unplanned future spend in forecast.
- Filtering the balance polyline by category.
- Introducing a second chart language (`SpendHistoryChart`) on Analysis in this pass.
- Changing the `debt_link_requires_paid` server rule (UI/copy adapt to it).

## Product invariants

- Bank import remains preferred transaction truth; plan settlement links existing rows.
- Ledger values and forecast values stay visually distinct.
- Forecast includes known/scheduled operations only (disclaimer stays).
- Category choice filters flows; saldo includes all PLN operations.
- Private vs group scopes stay explicit; forecast remains private-scope only.

---

## 1. Plans / mortgage

### 1.1 Debt terms editor

**Bug:** `[id]/+page.svelte` passes `onDebtPlanSave`; `DebtPlanDetail.svelte` gates the editor on `onTermsSave` only.

**Change:** Render the terms editor when `onDebtPlanSave || onTermsSave`. Prefer `onDebtPlanSave` in handlers (already the case).

### 1.2 Save plan link / contribute

**Bug:** Link-existing CTA is nested under `onContribute`, and `onContribute` is only set when `planBucket === "active" && status === "active"`. Upcoming saves (e.g. Malta) hide linking.

**Change:**

- Always pass a link-existing affordance for manageable save plans (active or upcoming), independent of contribute.
- Keep cash contribution/correction gated to active plans if product still wants that; do not hide “Powiąż istniejącą” with it.
- Settle route remains `/plans/[id]/settle`.

### 1.3 Debt manual add requires paid

**Bug:** Dialog suggests `upcoming` for future dates; RPC `link_plan_transaction` / `create_and_link_plan_transaction` raises `debt_link_requires_paid`.

**Change:**

- In plan debt context (`TransactionDialog` / plan page), force or lock `status: "paid"` for create-and-link.
- Map `debt_link_requires_paid` in `P0001_MESSAGES` to clear Polish copy.
- Pass plan `startDate` / `endDate` into settle and manual plan context so outside-period failures are understandable.

### 1.4 List vs detail totals

**Bug:** Detail sums all linked expenses; list/`computePlanProgress` counts paid settlement statuses only. Detail can show a linked row while the hero disagrees, or vice versa.

**Change:**

- Detail hero / linked-expense totals that drive progress use the same `isSettlementStatus` filter as `computePlanProgress`.
- Unpaid linked rows may remain visible with copy that they do not count toward progress yet (debt should rarely have these after 1.3).
- Debt live balance continues to ignore pre-anchor links (existing settle toast); surface a short note on detail when such links exist.

---

## 2. Upcoming sort on Transactions

**Bug:** `TransactionTable` defaults `initialSortDirection="desc"`. Upcoming/overdue views show farthest dates first. Kokpit already sorts ascending.

**Change:**

- When the transactions page is focused on upcoming/overdue (`status` query is only those bands, or the upcoming/overdue bands in the status-banded view), use date **asc** (soonest first).
- Prefer: pass `initialSortDirection="asc"` for upcoming-focused URLs, and ensure upcoming/overdue bands in the default ledger also present soonest-first within those bands.
- Re-selecting the Date column should not force `desc` when the page’s initial direction is `asc`.

---

## 3. Analysis forecast detail + bars

**Today:** Forecast shows today/final balance, planned income/expense totals, balance line, day picker.

**Change:**

- Extend `buildAnalysisForecast` / `AnalysisForecast` with flow bars (reuse `flowBars` / `AnalysisBar` patterns from history) over the same known/scheduled movements already used for totals.
- In forecast UI, render the same dual planowane wpływy / wydatki bar presentation as history (labels clearly “planowane”).
- Add a compact category (and/or month) breakdown of planned movements with drill-down to transactions using upcoming/overdue-friendly status filters.
- Keep `CockpitForecastChart` as the balance line above bars.
- Do not invent unplanned spend; keep the existing disclaimer.

---

## 4. Category filters

**Today:** Chips filter paid flows for income/expense/bars/shifts; balance chart ignores them. Top categories (`overview.categories`) are computed but never rendered. Chip universe can include categories outside the visible window.

**Change:**

- Keep chips as **flow filters only**; never filter the balance series.
- Rewrite label/note so the effect is obvious (e.g. filters narrow wpływy/wydatki bars and category summary; saldo stays full PLN).
- Render the top-categories summary so selecting chips has a clear result.
- Limit chip choices to categories present in the current analysis window’s paid flows.
- Optional later: same flow-only filter on forecast once forecast bars exist (same invariant). Include in this pass if low-cost; otherwise history-only chips remain acceptable for v1 of this work.

---

## Testing

- Unit: debt/save gating helpers if extracted; settlement paid-filter parity; upcoming sort direction; forecast bars from known projections; category chip universe restricted to window.
- Component/E2E (mocked): debt detail shows terms editor; upcoming save shows link CTA; debt create-and-link with future date succeeds as paid; transactions upcoming list soonest-first; analysis forecast shows bars; category filter updates bars/summary without changing balance series.
- Gates: svelte-check, lint, format, unit, components, e2e as required by UI/copy changes; Paraglide recompile after `pl.json`.

## Rollout

- Feature branch → `dev` via `./scripts/open-pr.sh`.
- No schema migrations expected.
- Changelog bump only if promoting to production in the same ship; otherwise leave for promote.

## Out of scope follow-ups

- Longer default mortgage `end_date` / term-derived horizon.
- Kokpit `SpendHistoryChart` on Analysis.
- Removing category chips entirely in favor of a table-only filter.
