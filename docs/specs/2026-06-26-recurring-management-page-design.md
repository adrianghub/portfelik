# Spec — Recurring management page (`/recurring`)

Date: 2026-06-26
Status: Approved (design); pending implementation plan
Branch base: `dev`

## Context

Post-Spec-2 review: managing recurring series only via the per-row detail-sheet
panel makes the user hunt rows. Add a dedicated page that lists all active
recurring series with edit/end actions. In-place detail-sheet editing (Spec 2)
stays. The page is **not** a navigation item — it is reached from `/dashboard`
and `/transactions`.

User decisions:
- v1 manages existing series only; creating a recurring still happens by flagging
  a transaction (`TransactionDialog`) or accepting a detection suggestion.
- List active series only (ended ones omitted).
- Per-row actions: Edytuj serię + Zakończ od dziś (no full/history delete).
- Entry points: a dashboard "Cykliczne (N)" link + a transactions header action.
  Not in `Navigation`.

## Current state (verified)

- Routes are flat under `src/routes/` (e.g. `dashboard`, `transactions`,
  `plans`, `settings`). New page → `src/routes/recurring/+page.svelte`.
- `fetchRecurringTemplates()` (`services/transactions.ts`) returns `is_recurring`
  rows, RLS-scoped (private + visible group rows).
- `recurrenceSummary(parts)` (`lib/recurrence.ts`) → human cadence string.
- `occurrenceDates(t, afterMs, beforeMs)` (`services/recurring-forecast.ts`) →
  ordered occurrence dates; first ≥ today = next occurrence. Respects
  `recurrence_end_date` (Spec 2).
- `endSeriesFromOccurrence({ template, occurrenceDate })`
  (`services/recurring-series.ts`) ends a series and prunes future upcoming rows.
- `canManageTransaction(tx, userId, roles)` gates edit/delete.
- `TransactionDialog` opens with a template for whole-series editing (incl. the
  end-date field).
- `Navigation.svelte` holds the nav items — left untouched.

## Design

### 1. Pure core — `services/recurring-series.ts` (extend)
```ts
export interface RecurringSeriesSummary {
  id: string;
  title: string;            // counterparty || description
  type: "income" | "expense";
  amount: number;
  categoryName: string;
  groupId: string | null;   // null = private
  cadence: string;          // recurrenceSummary(...)
  nextDate: string | null;  // first occurrence >= today, or null if none left
  startDate: string;        // template.date (date-only)
  endDate: string | null;   // recurrence_end_date or null (open-ended)
}

export function isActiveRecurringSeries(
  t: TransactionWithCategory, today: string
): boolean;  // is_recurring && recurrence_frequency && (end == null || end >= today)

export function summarizeRecurringSeries(
  t: TransactionWithCategory, now?: Date
): RecurringSeriesSummary;

export function buildRecurringSeriesList(
  templates: TransactionWithCategory[], now?: Date
): RecurringSeriesSummary[];  // filter active, summarize, sort by nextDate asc (nulls last)
```
Pure (UTC; `now` injectable); `nextDate` via `occurrenceDates(t, todayMs−1, todayMs + ~370 days)` first entry ≥ today. Unit-tested.

### 2. Page — `src/routes/recurring/+page.svelte`
- `createQuery(["recurring-templates"], fetchRecurringTemplates)` → `buildRecurringSeriesList`.
- Renders a minimalist list (card per series): title, category, signed amount
  (`formatCurrency`), cadence, "następne: {nextDate}", "zakres: {startDate} →
  {endDate | Bezterminowo}", scope badge (**Prywatne / Wspólne**, derived from
  `groupId` — no group-name lookup needed). Mobile-friendly stacked layout.
- Loading skeleton + `QueryError` (existing patterns). Auth-guarded like other
  routes.
- Holds current user id + group roles (existing queries) to compute
  `canManageTransaction` per row.

### 3. Per-row actions
- **Edytuj serię** (only if manageable) → open `TransactionDialog` with the
  template (`editTarget = template; dialogOpen = true`). On save success,
  invalidate `["transactions"]` + `["recurring-templates"]`.
- **Zakończ od dziś** (only if manageable) → `ConfirmDialog` →
  `endSeriesFromOccurrence({ template, occurrenceDate: todayIso })`. On success,
  invalidate `["transactions"]`, `["recurring-templates"]`,
  `["transactions","recurring-skips"]`, `["plan-progress"]`,
  `["plan-progress-list"]`; toast `m.toast_*`. Row leaves the active list (its
  end date is now in the past).
- Members viewing a group series they cannot manage see it read-only (no action
  buttons), matching `canManageTransaction`.

### 4. Entry points (NOT in `Navigation`)
- **Dashboard** (`src/routes/dashboard/+page.svelte`): a small "Cykliczne ({N})"
  link in the Status area, where `N` = active count derived from the existing
  `recurringTemplatesQuery` via `buildRecurringSeriesList(...).length`. Links to
  `/recurring`. Hidden when `N === 0`.
- **Transactions** (`src/routes/transactions/+page.svelte`): a header action
  ("Cykliczne") next to Import / Dodaj, linking to `/recurring`.

### 5. Empty / scope
- Empty: "Nie masz aktywnych transakcji cyklicznych." + a hint that recurring is
  created by marking a transaction as cyclical.
- Shows private + visible group series (RLS-scoped) with a Prywatne/Wspólne
  badge each.

### Files (anticipated)
- `src/routes/recurring/+page.svelte` (new)
- `src/lib/services/recurring-series.ts` (+ summary/active/list helpers)
- `src/routes/dashboard/+page.svelte` (entry link + active count)
- `src/routes/transactions/+page.svelte` (header entry action)
- `messages/pl.json` (+ paraglide): page title, field labels, actions, empty,
  entry-link label
- (optional) a small `RecurringSeriesCard.svelte` if the page row markup grows.

### Query invalidation
Edit/end reuse the existing invalidation sets; `["recurring-templates"]` drives
the page refetch.

## Testing & gates
- unit: `isActiveRecurringSeries` (open-ended active; ended excluded; today
  boundary), `summarizeRecurringSeries` (cadence, next ≥ today, range, private vs
  group), `buildRecurringSeriesList` (active filter + nextDate asc, nulls last).
- E2E: `/recurring` lists a seeded weekly series with cadence + next date →
  Edytuj opens the dialog → Zakończ od dziś confirms and removes it from the
  list; dashboard "Cykliczne" link and transactions header action both navigate
  to `/recurring`.
- svelte-check 0/0, lint 0, format clean, Svelte MCP clean on new/edited
  components, paraglide recompiled, secret scan clean.

## Risks
- `nextDate` must respect `recurrence_end_date` (Spec 2) — reuse `occurrenceDates`
  which already does; pin with a unit test (series ending soon has no nextDate).
- Group series the user can't manage must render read-only — gate every action
  with `canManageTransaction`, not just hide-by-scope.
- The dashboard active count reuses `recurringTemplatesQuery`; ensure that query
  is loaded on the dashboard (Spec 1 wires it) so the link count is correct.

## Out of scope
- Creating a new recurring on the page (stays in the transaction flow / detection
  suggestion).
- Ended-series view / active-ended toggle.
- Full / history-destroying delete.
- Group-scope management changes beyond existing RLS gating.
