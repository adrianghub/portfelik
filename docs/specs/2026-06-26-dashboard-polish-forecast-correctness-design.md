# Spec 1 — Dashboard polish & forecast correctness

Date: 2026-06-26
Status: Approved (design); pending implementation plan
Branch base: `dev` (post-#169)

## Context

After PR #169 (deterministic action cards) merged, manual review surfaced a
batch of UI/UX gaps on `/dashboard` and the spend-history chart. This spec
covers the **polish + correctness** half. A second spec (Spec 2) covers the
recurring/upcoming **management feature** (`recurrence_end_date`, series
actions, balance impact) and is brainstormed separately.

User decisions:
- Sequence: Spec 1 first, then Spec 2.
- Recurrence management (Spec 2): series actions on any occurrence row.
- Attention anomaly copy: rewrite as natural action, drop the `≈N×` multiplier
  from the headline.

## Problems & root causes (verified)

1. **InfoTooltip clipping** — `ui/InfoTooltip.svelte` panel is `absolute` +
   `-translate-x-1/2 w-64` inside a card. Near a card edge / under overflow
   clipping the panel is cut off (BILANS / "STOPA OSZCZĘDNOŚCI" shot). Affects
   every InfoTooltip instance.
2. **Chart tooltip overflow → mobile horizontal scrollbar** —
   `charts/SpendHistoryChart.svelte` layerchart `Tooltip.Root` panel widens the
   page on narrow viewports; `contained="container"` does not prevent the
   horizontal scrollbar.
3. **"Teraz" marker is misleading** — literal text in the `belowMarks` fragment.
   Desired: bold the current period instead.
4. **Forecast bars near-empty + chart ≠ table** — `dashboard/+page.svelte`
   `forwardBuckets` buckets **only** `projectRecurringOccurrences(...)`. It
   excludes (a) real one-off `upcoming` rows (e.g. sportano −389, Decathlon
   −849) and (b) materialized recurring occurrences (deduped out of the
   projection, never re-added). `/transactions` merges real upcoming +
   projected, so the two surfaces diverge and forecast bars under-report.
5. **Bar click-through "not implemented"** — `selectHistoryPeriod` IS wired
   (`dashboard/+page.svelte:113`, `SpendHistoryChart` `onbarclick`). It appears
   dead only because forecast bars have ~no height (problem 4). Fixing 4
   restores clickability.
6. **"Co wymaga uwagi" anomaly copy** — `dashboard/DashboardActions.svelte`
   renders stat-style `≈2.6× średniej`, not an action.
7. **"Wydatki w tym okresie" bottom-right barely visible** — smallest treemap
   cell label/contrast in `charts/SpendingTreemap.svelte`.
8. **Copy** — tooltip + caption Polish across the dashboard reads stiff.

## Scope

In scope (Spec 1):
- A. InfoTooltip clipping fix (portal + viewport clamp).
- B. Chart tooltip width cap + no mobile horizontal scrollbar.
- C. Replace "Teraz" text with bolded current-period axis label; keep subtle
  divider line (no copy).
- D. Forecast source = real `upcoming` rows in window + non-duplicate projected
  occurrences, merged/deduped → chart matches `/transactions`.
- E. Verify bar click-through works on past + forecast buckets, mobile +
  desktop, lands on `/transactions` with correct period/status params.
- F. Rewrite anomaly action copy (drop `≈N×` from headline; optional faint
  subtext); minimal pass on other action kinds.
- G. Treemap smallest-cell legibility (contrast or size-threshold label hide).
- H. Polish copy polish across dashboard tooltips/captions; recompile Paraglide.

Out of scope (→ Spec 2):
- `recurrence_end_date` column + migration.
- Series management actions (shorten/extend/remove/change frequency).
- Running balance for projected rows; expected-balance-after-upcoming surface.

## Design

### A. InfoTooltip (`ui/InfoTooltip.svelte`)
Render the panel in a body portal with `position: fixed`. On open, read the
trigger button's `getBoundingClientRect()`; position the panel centered on the
button horizontally, above (`side="top"`) or below (`side="bottom"`); clamp
left/right to viewport with a ≥8px margin; flip vertical side if no room. Keep
existing hover/focus/Escape/`scheduleHide` behavior and `aria-describedby`
wiring. Reposition on scroll/resize while open (or close on scroll — pick the
simpler robust option during impl). No API change for callers.

Acceptance: BILANS tooltip and a left-edge / right-edge tooltip render fully
on-screen on desktop and a 375px viewport.

### B. Chart tooltip (`charts/SpendHistoryChart.svelte`)
Cap the `Tooltip.Root` panel width to `min(16rem, 90vw)`; keep it clamped
inside the chart box; add `overflow-x-hidden` to the chart wrapper so the panel
cannot widen the page.

Acceptance: no horizontal scrollbar at 375px; tooltip fully visible for
first/last bars.

### C. Current-period marker (`charts/SpendHistoryChart.svelte`)
Remove the `m.dashboard_forecast_now_divider()` text node. Keep the dashed
boundary line at `firstProjectedLabel`. Bold the current period's x-axis tick
label — the last non-projected bucket (present window). Implement via a
per-tick label class/format that bolds the matching label.

Acceptance: no "Teraz" text; current period label visually bold; divider still
marks the forecast boundary.

### D. Forecast source (`dashboard/+page.svelte`)
Replace the `forwardBuckets` source. New source for the forward windows =
union of:
- real rows from `forwardRealTxQuery` with `status === "upcoming"` (already
  fetched, currently used only for dedup), scoped/typed like the table, and
- `projectRecurringOccurrences(...)` (existing), which already dedups against
  those real rows.

Bucket the merged set with `bucketPeriodHistory(merged, forwardWindows)`. Keep
`isProjected: true` on forward buckets for styling. Ensure the same
type/category/group/view scoping the table uses, so chart and table agree for
an identical window.

Acceptance: for July (or any forward window), chart bar category breakdown
equals `/transactions` filtered to that window's `upcoming` rows; previously
missing one-off upcoming + materialized recurring rows now appear.

### E. Click-through verification
No new code expected beyond D. Verify: clicking a past bar opens
`/transactions` with `startDate/endDate/group/type=expense`; clicking a
forecast bar additionally sets `status=upcoming&forecast=recurring`; works on
mobile + desktop.

### F. Attention copy (`dashboard/DashboardActions.svelte` + messages)
Anomaly card: headline becomes a plain action sentence (e.g. "Sport i
rekreacja wyżej niż zwykle — sprawdź wydatki"); move/remove the `≈N×`
multiplier (faint subtext at most). Minimal natural-language pass on the other
action card kinds for consistency.

Acceptance: anomaly card reads as an action, not a metric; no raw `≈N×` in the
headline.

### G. Treemap legibility (`charts/SpendingTreemap.svelte`)
Confirm exact cause (smallest bottom-right cell label contrast). Fix by raising
label/cell contrast to a legible minimum, or hide the label below a size
threshold rather than rendering it near-invisible.

Acceptance: bottom-right smallest cell is either legibly labeled or cleanly
unlabeled — never a near-invisible string.

### H. Copy polish (`messages/pl.json` + Paraglide)
Tighten dashboard tooltip/caption copy: natural, minimal, clean Polish. Edit
`messages/pl.json`, recompile Paraglide
(`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`).

## Files touched (anticipated)
- `src/lib/components/ui/InfoTooltip.svelte` (A)
- `src/lib/components/dashboard/charts/SpendHistoryChart.svelte` (B, C)
- `src/routes/dashboard/+page.svelte` (D, E)
- `src/lib/components/dashboard/DashboardActions.svelte` (F)
- `src/lib/components/dashboard/charts/SpendingTreemap.svelte` (G)
- `messages/pl.json` + `src/lib/paraglide/**` (F, H)

## Testing & gates
- Unit: forecast-merge logic (D) — assert forward buckets include real upcoming
  + projected, deduped, matching the table's set for a window.
- svelte-check 0/0, lint 0, format clean.
- E2E: extend/adjust dashboard forecast spec to assert non-empty clickable
  forecast bar + navigation params; verify no horizontal scroll at 375px.
- Manual: InfoTooltip on-screen at edges (desktop + 375px); treemap legibility.
- Paraglide recompiled if `pl.json` touched.
- Secret scan clean.

## Risks
- Layerchart per-tick bold (C) may need a custom tick renderer; fall back to a
  subtle current-period rule/label if the API resists.
- Merging real upcoming into forward buckets (D) must not double-count
  materialized recurring rows — rely on existing `projectRecurringOccurrences`
  dedup; add a unit test pinning the dedup.

## Spec 2 (next, separate brainstorm)
Recurring/upcoming management: `recurrence_end_date` migration; "Seria
cykliczna" panel on any occurrence/projected row's detail sheet (Zakończ
wcześniej / Przedłuż / Zmień częstotliwość / Usuń serię); running balance for
projected rows; expected-balance-after-upcoming surface on `/transactions`.
