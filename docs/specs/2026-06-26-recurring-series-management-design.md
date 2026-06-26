# Spec 2 — Recurring/upcoming series management + balance impact

Date: 2026-06-26
Status: Approved (design); pending implementation plan
Branch base: `dev` (after Spec 1 commits)

## Context

Follow-up to Spec 1 (`2026-06-26-dashboard-polish-forecast-correctness-design.md`).
Post-#169 review flagged that managing recurring/upcoming transactions is poor:
recurrence is editable only per single row, there is no way to shorten/extend or
stop a series without hunting the template row, projected rows are read-only, and
upcoming transactions don't show their impact on balance.

Goal: Google/Outlook-Calendar-style recurrence management — act on any
occurrence with **scope** (this one / this and following / all) — plus a
forecast running balance so the user sees expected balance after upcoming hits.

User decisions:
- Remove "remove a series": two non-destructive scopes — *To wystąpienie*
  (skip one) and *To i przyszłe* (end the series going forward, keep past).
  No full-history delete.
- Balance: forecast running balance in the `Saldo` column through upcoming +
  projected, plus a window-end "Przewidywane saldo" figure. Private scope.
- Series freq/interval/day editing reuses the existing `TransactionDialog`
  loaded with the template (not a duplicated inline form).
- Ship as one increment.
- Delete scopes: *To wystąpienie* + *To i przyszłe* only (not *Cała seria*).
- Edit scopes: *To wystąpienie* + *Cała seria* only (no this-and-following
  split / series lineage in v1).

## Current state (verified)

- No `recurrence_end_date` column on `transactions`. Recurrence columns:
  `is_recurring`, `recurrence_frequency`, `recurrence_interval`,
  `recurrence_weekday`, `recurrence_month`, `recurring_day`,
  `recurring_template_id`, `recurring_occurrence_date`.
- `recurring-forecast.ts` `occurrenceDates`/`projectRecurringOccurrences`
  generate occurrences open-endedly (no end bound).
- `recurring-occurrences.ts`: `materializeRecurringOccurrencesForNearTerm`
  (upsert 14-day near-term real rows, conflict on
  `user_id,recurring_template_id,recurring_occurrence_date`),
  `rememberRecurringOccurrenceSkip` (upsert into `recurring_occurrence_skips`,
  links `skipped_transaction_id`), `fetchRecurringOccurrenceSkips`.
- `TransactionDialog`: editing a row with `recurring_template_id` hides the
  recurrence panel (single-row edit only, forces `is_recurring=false`); editing
  the template shows the full recurrence panel. No end-date field anywhere.
- `TransactionDetailSheet`: edit/delete only for real rows (`canEdit` excludes
  `projected`). No series affordance; projected rows are read-only.
- `cash-position.ts`: `livePosition` (paid only), `forecastPosition`
  (`livePosition` + upcoming), `runningBalances` (paid only, per-row Map by id).
  Transactions page already computes `runningBalanceById` for private paid rows
  and shows an opt-in `Saldo` column.

## Design

### 1. Schema
Migration `2026XXXXXXXXXX_recurrence_end_date.sql`:
- `ALTER TABLE transactions ADD COLUMN recurrence_end_date date;` (nullable;
  `NULL` = open-ended). Meaningful only on template rows (`is_recurring=true`).
- Verify `transactions_recurring_template_id_fkey` is `ON DELETE SET NULL`. The
  v1 flows never delete past occurrences, but skip-delete removes single
  materialized rows; keep the existing skip FK behavior
  (`recurring_occurrence_skips.skipped_transaction_id` nullable / SET NULL) so a
  deleted occurrence doesn't orphan a skip. Alter only if current behavior
  would break these flows.
- No new table. Existing transactions RLS covers the new column.

### 2. Projection + materialization respect the end date
- `recurring-forecast.ts`: add `recurrence_end_date` to the template type;
  `occurrenceDates`/`projectRecurringOccurrences` stop emitting occurrences with
  `date > recurrence_end_date`.
- `materializeRecurringOccurrencesForNearTerm`: skip occurrences past
  `recurrence_end_date`.
- Effect: shorten/extend instantly reshapes the chart, the `/transactions`
  list, and the forecast (all read these).

### 3. Series management panel — calendar-style scoped actions
New "Seria cykliczna" panel in `TransactionDetailSheet`, shown for real
occurrences, projected rows, and the template itself. Summary: częstotliwość,
następne wystąpienie, zakres start–koniec. Two scope-prompting actions:

- **Edytuj** → scope chooser:
  - *To wystąpienie* — edit the single row. If the row is projected,
    materialize that occurrence first (insert a real row from the projection),
    then open single-row edit.
  - *Cała seria* — open `TransactionDialog` with the **template** (fetched by
    `recurring_template_id` when acting on an occurrence). Full
    freq/interval/day/month controls + a new **end-date** field. Doubles as
    "Przedłuż" (set a later/empty end date).
- **Usuń** → scope chooser:
  - *To wystąpienie* — `rememberRecurringOccurrenceSkip` + delete the real row
    if materialized.
  - *To i przyszłe* — end the series here: set template `recurrence_end_date` =
    day before this occurrence's date; delete future `upcoming` materialized
    rows dated ≥ this occurrence. Past real rows stay.

Scope chooser: a small Calendar-style prompt (reuse `ConfirmDialog` pattern or a
lightweight scoped sheet). Works from any row → no template hunting. `canEdit`
gains series-action permission for projected rows (single-row edit/delete of a
projection remains N/A; the panel provides the appropriate scoped action).

### 4. Forecast running balance + end figure (/transactions)
- `cash-position.ts`: new pure `forecastRunningBalances(anchor, txs)` — like
  `runningBalances` but continues from live balance through **upcoming +
  projected** rows in date order; returns per-row Map keyed by id (projected
  ids included). Private scope.
- `TransactionTable`: `Saldo` column shows the live running balance for paid
  rows and the continuing forecast balance for upcoming/projected rows.
- `transactions/+page.svelte`: compute forecast running balance over
  (paid + upcoming + projected) private rows; show a **"Przewidywane saldo"**
  figure for the window end (reuse `forecastPosition`). Private scope only
  (matches the existing `Saldo` constraint; hidden for group/all scope).

### 5. Services
New `services/recurring-series.ts` (pure helpers + thin Supabase writers):
- `endSeriesFromOccurrence({ template, occurrenceDate })` — set
  `recurrence_end_date = dayBefore(occurrenceDate)`; delete
  `transactions where recurring_template_id = template.id and status='upcoming'
  and date >= occurrenceDate`.
- `skipOccurrence(occurrence)` — `rememberRecurringOccurrenceSkip` + delete the
  real row if materialized.
- `materializeOccurrence({ template, occurrenceDate })` — insert one real row
  from the projection (for "edit this occurrence" on a projected row).
- Pure date helpers (`dayBefore`, future-filter predicate) extracted for tests.
Extend `services/transactions.ts` + `types.ts` to carry `recurrence_end_date`
through fetch/insert/update.

### Files (anticipated)
- migration `supabase/migrations/2026XXXXXXXXXX_recurrence_end_date.sql`
- `src/lib/services/recurring-forecast.ts`
- `src/lib/services/recurring-occurrences.ts`
- `src/lib/services/recurring-series.ts` (new)
- `src/lib/services/cash-position.ts`
- `src/lib/services/transactions.ts` + `src/lib/types.ts`
- `src/lib/components/transactions/TransactionDetailSheet.svelte`
- `src/lib/components/transactions/TransactionDialog.svelte`
- `src/lib/components/transactions/TransactionTable.svelte`
- `src/routes/transactions/+page.svelte`
- `messages/pl.json` + `src/lib/paraglide/**` (gitignored, recompiled)

### Query invalidation
After any series mutation invalidate `["transactions"]` (prefix-matches
`["transactions","cash-history",…]` and the dashboard forward queries), plus
`plan-progress`/`plans`/`plan-links` when a settled occurrence is affected,
mirroring the existing delete-occurrence flow.

## Testing & gates
- unit: projection stops at `recurrence_end_date` (occurrenceDates + projection);
  `forecastRunningBalances` cumulative incl. upcoming + projected, chronological,
  private-only; `endSeriesFromOccurrence` date math + future-filter predicate;
  `dayBefore` edge (month/year boundary, UTC).
- RLS: `recurrence_end_date` read/write under existing transactions policies
  (owner + co-owner write, member read); regression count stays green.
- E2E: end series "To i przyszłe" from an occurrence → future bars/rows vanish,
  past stays; "To wystąpienie" skip removes one slot and forecast/sync doesn't
  recreate it; forecast `Saldo` column + "Przewidywane saldo" render in private
  scope.
- svelte-check 0/0, lint 0, format clean, Svelte MCP clean on edited components,
  paraglide recompiled, secret scan clean, `supabase db reset` replays the new
  migration cleanly.

## Risks
- "Edit this occurrence" on a projected row must materialize first, then edit, in
  a way that doesn't double-create (rely on the existing upsert conflict key).
- Forecast running balance must not double-count materialized recurring rows vs
  projected (reuse the projection dedup; pin with a unit test).
- Self-FK on-delete behavior: confirm before relying on skip-delete; the v1
  flows avoid deleting past rows, but verify the skip FK tolerates a deleted
  occurrence.
- `recurrence_end_date` is template-only state; ensure occurrence rows never
  carry/require it (ignored on non-template rows).

## Out of scope
- Edit "this and following" (series split / lineage) — deferred.
- Full-history series delete ("Cała seria incl. past").
- Group-scope forecast running balance (private only in v1).
