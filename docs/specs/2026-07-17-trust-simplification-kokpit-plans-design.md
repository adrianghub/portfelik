# Trust simplification — Kokpit, Plany, cash strip, goal detail

Date: 2026-07-17
Status: Implemented (local); plan at `docs/plans/2026-07-17-trust-simplification-kokpit-plans.md`
Branch base: `dev`
Approach: **Trust + allocation pass** (UI honesty; engines keep ledger truth)

## Context

Dogfooding showed Kokpit and `/plans` over-explaining engine internals: period
controls visually unbalanced, savings-ratio copy that scares without teaching,
goal deposits (`Cele` / linked save contributions) treated as consumption
alarms, Nadwyżka framing that contradicts a simple month deficit, and goal
detail CTAs / Wpłaty layout that fight mobile width.

Product doctrine (`docs/product/intent-oriented-ui.md`): surface decisions, hide
mechanics. Ledger truth (money left the account) stays; insight surfaces must
not treat allocations as “you overspent.”

## User decisions

| Topic            | Choice                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| Nadwyżka card    | **A** — slim honest bilans; drop essay                                                  |
| Cash strip       | **C** — sheet on Transakcje + link to `/plans` Majątek netto                            |
| Cele in spending | **C** — exclude from insight/trend/anomaly/chart stack math; keep visible as allocation |
| Delivery shape   | Approach 2 (trust + allocation), not polish-only or full rewrite                        |

## Problems (verified against UI + source)

### Kokpit

1. **`Zakres dat` oversized** — `DateRangePicker` trigger uses heavier padding/border than period chips in `DashboardViewToolbar.svelte`.
2. **`Za mało przychodów` / `-100% przychodów`** — `savingsRatio` null shows NA copy; when income ≥ 150 zł but net is deeply negative (often from Cele), ratio clamps to −100% and reads as a verdict (`DashboardBalanceHero.svelte` + `dashboard/+page.svelte`).
3. **Goal strip vs alarms diverge** — `computeGoalSpendingSplit` powers “Na cele / Pozostałe”, but `computeSpendingInsight` still folds Cele into `spent`, category ↑%, movers, and headline delta. `DashboardActions` filters Cele in one place only (easy to regress).
4. **Category story ×3** — Bilans legend + TOP KATEGORIE + SZCZEGÓŁY (`SpendingCategoryBreakdown`) repeat the same list with extra “Zobacz więcej” links.
5. **Forecast/history chart drowned by Cele** — `stackCategoryHistory` includes Cele; large deposits dominate bar height and bar-detail sheets.
6. **Plan progress `#N` badge** — `eligibleCount` with sparkles looks like an issue id; unlabeled.

### `/plans`

7. **Nadwyżka title + “brakuje na zobowiązania”** — `SurplusCard` uses `availableForGoals` (= cashflow − unreflected debt) with alarm copy even when the user simply has more expenses than income; goal essay uses `saveMonthlyNeeded` not unmet need → “5000 z 500” + “brakuje jeszcze 500”.
8. **Debt chip duplicates Hipoteka card** — same monthly rata in Surplus action list and plan list.
9. **Net worth over-explains** — private badge + long filter hint + manual note + `net_worth_goal_assets_hint` (“Nie dodawaj jej ponownie ręcznie”).
10. **Cash strip read-only** — `CashPositionStrip` has no edit path; anchor edit lives only in `/plans` net-worth form.

### Goal detail

11. **`CEL` eyebrow beside saved amount** — reads as if target = saved (`SavePlanDetail.svelte`).
12. **On-track ×3** — hub badge + detail badge + “Jesteś na dobrej drodze”.
13. **Pace without basis** — lump “Odkładasz 5000” vs “Potrzebujesz 500” looks broken without “w tym miesiącu” / estimate label.
14. **Three add doors** — Dodaj wpłatę / Powiąż wpłaty / Dodaj ręcznie; page + `LinkedSection` both title “WPŁATY”; long descriptions overflow on mobile; `−amount` in green confuses sign semantics.

## Design

### Principle

| Layer   | Rule                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger  | Income − all paid expenses (incl. Cele) may still appear in Bilans totals / ring                                                              |
| Insight | Trends, ↑%, anomalies, spend-history stack height use **consumption** = expenses excluding save-linked + `Cele` category (`goal-spending.ts`) |
| Copy    | One honest number + one useful action; no engine footnotes by default                                                                         |

### 1. Kokpit

**Toolbar** — Match closed trigger to period chip height/padding/border via a **dashboard/compact variant** on `DateRangePicker` (prop or wrapper class). Do **not** globally restyle the Transakcje date control. Calendar icon retained.

**Savings ratio** — When `savingsRatio === null`, render nothing (delete `dashboard_savings_na` usage). When `|pct| === 100` and `|net| > income`, also render nothing (clamped noise). Do not recompute on consumption this pass; do not show misleading −100%.

**Spending insight** — Extend `computeSpendingInsight` (accept allocation-exclusion set / cele id) so `spent`, `prevSpent`, `spentDeltaPct`, category totals/deltas/anomalies, and movers exclude allocation txs (same definition as `computeGoalSpendingSplit`). The card’s header total uses this consumption `spent` (aligns with “Pozostałe”). Keep goal strip UI above it. Drop default **SZCZEGÓŁY / biggestMovers** block from the card; one TOP list + single “Zobacz więcej” for full categories. Move Cele exclusion into the engine (not only `DashboardActions` filter).

**Spend history chart** — **Exclude** Cele/allocation categories from stacked bar height this pass. Period detail sheet: **Razem = stack total (consumption only)**. If Cele/allocation rows exist in the window, list them in a separate “Wpłaty na cele” group **outside** that sum (transparency without breaking bar ↔ total equality).

**Plan progress badge** — Always label settle-ready count (e.g. `{n} do powiązania`); display `9+` when `eligibleCount > 9`, with full count in `aria-label`. Never bare numeric/sparkle-only chip.

### 2. `/plans` Surplus → Bilans miesiąca

- Title: always **“Bilans tego miesiąca kalendarzowego”** (drop “Nadwyżka” framing).
- Headline: plain cashflow (`summary.surplus` / income − expenses). Positive: “Bilans miesiąca: +X”. Negative: “Bilans miesiąca: −X” — **not** “brakuje na zobowiązania”.
- Remove: estimate note, goal after-save essay, saved-this-month vs need line, debt footnote in details.
- Actions: keep off-track-save / no-income queue chips when useful. **Remove the debt-rata queue action** from `buildPlanningQueueActions` (it always duplicates the Kredyty plan card on this hub).
- When `actions.length === 0`, show **no** “Brak pilnych działań…” filler — only the headline + optional details.
- Details `<details>`: income / expenses / bilans only + optional “Zobacz transakcje”.
- `computeMonthlySurplus` may remain for queue math; UI stops narrating unmet save pace.
- Prune unused surplus i18n keys touched by this change (dead `plans_surplus_*` essay/estimate/debt-note strings). Glossary `Nadwyżka` may stay if still used elsewhere; do not reintroduce Nadwyżka title on this card.

### 3. Net worth

- Remove `net_worth_goal_assets_hint` from `NetWorthHero`.
- Collapse privacy copy to **one** line (badge **or** short hint, not both long texts). Keep pencil → existing edit dialog.
- Optional follow-up (out of scope): collapse tiny asset-strip segments; fix `Label (EUR)` when label already contains EUR.

### 4. Cash strip (Transakcje)

- Strip is a button/link target (including empty set-hint state).
- Opens a **Sheet/Dialog**: opening amount + as-of date → existing `upsert` cash position API used by `/plans`.
- Secondary text link: **Majątek netto →** `/plans` (query/hash to open net-worth form if cheap; else scroll to hero).
- Do not duplicate full assets/debt form on Transakcje.

### 5. Goal detail

- Hero: label saved amount as **Odłożono** (not `CEL` as if target); keep “Odłożono X z Y” subline; ring % unchanged.
- One on-track signal (prefer badge **or** sentence, not both; hub card may keep its own badge).
- Monthly actual always means real linked contributions in the current calendar month.
  Historical averages must not drive a success badge or satisfy the current-month action.
- CTAs: primary **Zapisz nową wpłatę** creates a cash transaction; secondary
  **Powiąż istniejącą transakcję** reuses ledger history; tertiary **Skoryguj stan celu**
  stores a non-cash balance snapshot. Hide progress actions outside the active plan period.
- Wpłaty list: single section header (page summary **or** `LinkedSection` title, not both); mobile row `min-w-0`, truncate description, amount+unlink not overflowing viewport; prefer amount without confusing `−` in emerald for save contributions (show absolute + emerald, or “wpłata” framing).

## Known residuals (accepted this pass)

- Bilans ring / legend still reflect **full ledger** outflows (Cele visible); Wydatki + chart stack are **consumption**. Left/right emotional mismatch can remain until a later consumption-aware ring.
- Savings % uses full-ledger net for the hide rule, so big Cele deposits often suppress the % entirely (better than −100%; consumption-based ratio is a follow-up).

## Non-goals

- Second consumption-only Bilans donut
- Collapsing empty “Co wymaga uwagi”
- Nadchodzące status / Zapłać redesign
- Asset-strip “Pozostałe” for tiny segments
- Schema / migrations
- Changing contribution storage model (still Cele expenses + links)
- Computing savings ratio on consumption-only net

## Key files

| Area           | Files                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar        | `DashboardViewToolbar.svelte`, `DateRangePicker.svelte`                                                                                     |
| Bilans / ratio | `DashboardBalanceHero.svelte`, `dashboard/+page.svelte`, `messages/pl.json`                                                                 |
| Insight        | `spending-insight.ts`, `goal-spending.ts`, `DashboardSpendingInsight.svelte`, `SpendingCategoryBreakdown.svelte`, `DashboardActions.svelte` |
| Chart          | `SpendHistoryChart.svelte`, `period-history.ts` (stack helper)                                                                              |
| Plans          | `SurplusCard.svelte`, `NetWorthHero.svelte`, `plans/+page.svelte`                                                                           |
| Cash           | `CashPositionStrip.svelte`, `transactions/+page.svelte`, `cash-position.ts`                                                                 |
| Goal           | `SavePlanDetail.svelte`, `plans/[id]/+page.svelte`                                                                                          |
| Progress badge | `DashboardPlanProgress.svelte`                                                                                                              |

## Verification

- Unit: spending insight excludes Cele/linked from deltas/anomalies; goal split unchanged; surplus UI paths if covered; cash upsert if extracted helper
- E2E: dashboard spending with Cele present (no ↑% on Cele / headline uses consumption); plans surplus smoke; transactions cash sheet; goal detail layout
- Gates: svelte-check 0/0, lint, format, unit, touched E2E, secret scan on changed files

## Implementation note

Split PRs if needed: (1) Kokpit trust/allocation engines + UI, (2) Surplus/net-worth/cash, (3) goal detail polish — or one branch with three commits matching that split.
