# Spec 3 — Deeper automation: recurring-detection suggestions (slice 1)

Date: 2026-06-26
Status: Approved (design); pending implementation plan
Branch base: `dev`

## Context

Roadmap item "deeper automation — suggested, not applied": auto-suggest category
rules, settlement matches, and recurring detection — each with a confidence
score, an audit trail, and reversible. This is the first thing that turns the
shipped deterministic foundation (dashboard actions, dismiss memory, settlement
ranking) into felt magic ("it noticed my rent and offered to file it").

The capability is multi-subsystem. It decomposes into a shared suggestion
foundation plus three generator domains, each its own spec→plan→build cycle:

- **Domain A (this spec): recurring detection** — carries the new shared
  foundation (accept-with-undo + audit trail).
- Domain B (later): category-rule suggestions (from `Inne`/uncategorized
  repeats → create rule).
- Domain C (later): settlement-match surfacing (ranking + dismiss already
  exist → accept = link).

User decisions:
- First domain: recurring detection.
- Surface: extend the existing "Co wymaga uwagi" dashboard actions card with an
  inline accept (✓) alongside the existing deep-link + dismiss (×).
- Accept model: apply now + "Cofnij" undo toast + audit row (reversible).
- Audit storage: new `suggestion_events` table.
- Private scope only; group scope deferred.

## Current state (verified)

- `services/debt-payment-detect.ts` `detectRecurringDebtPayments` — a recurring
  pattern grouping core, but scoped to debt plans.
- `services/plan-settlement.ts` — `rankPlanTransaction`, `MIN_SUGGESTION_RANK_PCT`
  (45), `dismissPlanSuggestion` (settlement already has confidence + dismiss).
- `action_dismissals` table = dismiss memory only (`user_id, action_key,
  dismissed_until`). No accept path, no audit.
- `services/dashboard-actions.ts` `buildDashboardActions` — pure aggregator;
  cards are deep-link (`href`) + dismiss (`X`). No inline accept/apply mutation.
- `DashboardActions.svelte` — optimistic dismiss + "Cofnij" undo toast plumbing.
- Spec 2 shipped `recurrence_end_date`, `services/recurring-series.ts`
  (`removeFutureMaterializedOccurrences`, etc.),
  `materializeRecurringOccurrencesForNearTerm`.

So confidence scoring and dismiss memory already exist in places; the genuinely
new shared parts are **accept (a reversible mutation) + an audit trail**.

## Design

### 1. Detection core — `services/recurring-detect.ts` (pure)
`detectRecurringPatterns(input): RecurringSuggestion[]`

Input:
```ts
interface DetectInput {
  txs: TransactionWithCategory[];        // scoped paid private rows over the lookback
  templates: TransactionWithCategory[];  // existing recurring templates (to exclude)
  decided: Set<string>;                  // signatures already accepted/rejected
  now?: Date;
}
interface RecurringSuggestion {
  signature: string;        // stable: `${type}|${normalizedCounterparty}`
  counterparty: string;     // display (representative raw counterparty)
  type: "income" | "expense";
  categoryId: string;       // anchor's category
  amount: number;           // representative (median of |amount|)
  frequency: "weekly" | "monthly";
  interval: number;         // 1 (v1 only emits interval 1)
  recurringDay: number | null;    // monthly: day-of-month
  recurrenceWeekday: number | null; // weekly: ISO weekday
  anchorTxId: string;       // most recent matching tx — becomes the template
  occurrences: number;
  confidence: number;       // 0–100
}
```

Algorithm (all UTC, pure; `now` injectable):
1. Keep paid rows within a 180-day lookback whose `group_id` is null.
2. Group by `signature` = `${type}|${normalizeCounterparty(counterparty ?? description)}`.
   `normalizeCounterparty` lowercases, trims, collapses whitespace, strips
   trailing digits/dates/reference noise (documented, tested).
3. For each group with **≥ 3 occurrences**:
   - Sort by date; compute gaps (days). Classify cadence: **monthly** if median
     gap ∈ [26,33], **weekly** if ∈ [6,8]; otherwise skip the group.
   - Amount variance: coefficient of variation (stdev/mean of `|amount|`); skip
     if CV > 0.15 (amounts not stable enough).
   - Infer `recurringDay` (monthly: most common day-of-month) or
     `recurrenceWeekday` (weekly: most common ISO weekday).
   - `amount` = median of `|amount|`; `anchorTxId` = most recent row's id;
     `categoryId` = anchor's category.
4. Exclude groups whose signature is in `decided`, or already covered by an
   existing template (a template row with the same signature, or any input row
   carrying `recurring_template_id`).
5. Confidence (see §5). Drop suggestions below the floor (60). Sort by
   confidence desc.

Pure, DOM-free, unit-tested.

### 2. Schema — `suggestion_events` (migration `20260724000000_suggestion_events.sql`)
```sql
create table public.suggestion_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null,            -- 'recurring_detected' (more in later slices)
  signature   text not null,            -- pattern identity; suppresses re-suggestion
  payload     jsonb not null default '{}'::jsonb,
  confidence  int,
  decision    text not null check (decision in ('accepted','rejected')),
  reversal    jsonb,                    -- undo handle (anchor tx id + prior recurrence state)
  created_at  timestamptz not null default now(),
  constraint suggestion_events_user_kind_sig_unique unique (user_id, kind, signature)
);
alter table public.suggestion_events enable row level security;
-- owner-only select/insert/delete; no update needed (decision is terminal,
-- undo deletes the row). Narrow grants to authenticated.
```
RLS: owner-only (`user_id = auth.uid()`) for select/insert/delete. Grant
select/insert/delete to authenticated. The unique constraint makes a decision
idempotent and is the suppression key.

Note: the audit-event `kind` (`'recurring_detected'`) is a distinct namespace
from the dashboard **action** kind (`'recurring_suggested'`, §4). The event
records what was decided; the action kind drives card rendering.

### 3. Services — `services/suggestions.ts`
- `fetchDecidedSuggestions(kind): Promise<Set<string>>` — signatures with an
  existing event for `kind` (feeds the detector's `decided`).
- `acceptRecurringSuggestion(s: RecurringSuggestion): Promise<SuggestionReversal>`
  - Read the anchor tx's current recurrence fields (prior state) for `reversal`.
  - Update the anchor tx: `is_recurring=true`, `recurrence_frequency`,
    `recurrence_interval=1`, `recurring_day`/`recurrence_weekday`,
    `recurrence_month=null`, `recurrence_end_date=null`.
  - `materializeRecurringOccurrencesForNearTerm()` (existing) so the next
    occurrence appears.
  - Insert `suggestion_events` row: `decision='accepted'`, `payload` (signature,
    counterparty, amount, cadence, anchorTxId), `confidence`, `reversal`
    (`{anchorTxId, prior}`).
  - Return the reversal handle for the undo toast.
- `rejectRecurringSuggestion(s): Promise<void>` — insert `decision='rejected'`
  event (no mutation).
- `undoRecurringAcceptance(reversal): Promise<void>` — restore the anchor tx's
  prior recurrence fields, `removeFutureMaterializedOccurrences(anchorTxId, today)`
  (reuse Spec 2), delete the `suggestion_events` row.

Accept flags the most-recent matching transaction as the template (no new row,
no history duplication); undo reverts it cleanly. All writes pass `user_id`
implicitly via RLS default / existing update RLS.

### 4. Surface — `dashboard-actions.ts` + `DashboardActions.svelte`
- `buildDashboardActions` gains `recurringSuggestions: RecurringSuggestion[]`
  input and emits actions of new kind `recurring_suggested` (priority below
  overdue/debt/import, above settle), tone `default`, carrying `confidence` and
  the suggestion payload, `dismissKey = recurring_suggested:{signature}`.
- `DashboardActions.svelte`: for `recurring_suggested` cards render
  title ("Wygląda na cykliczne: {counterparty}"), a faint confidence chip
  ("pewność ~{confidence}%"), and TWO buttons:
  - **✓ Dodaj jako cykliczne** → `acceptMutation.mutate(s)`; on success a toast
    with "Cofnij" calling `undoRecurringAcceptance(reversal)`.
  - **× Odrzuć** → `rejectMutation.mutate(s)`.
  Both optimistically remove the card and invalidate `["transactions"]`,
  `["suggestion-events"]`, and the dashboard queries. Existing deep-link/dismiss
  cards are unchanged.
- The dashboard page wires the detector: a pure `$derived` over the already
  fetched rolling/history private paid rows + `recurringTemplatesQuery` +
  `fetchDecidedSuggestions`.

### 5. Confidence (deterministic) — in `recurring-detect.ts`
`confidence(occurrences, cv, cadenceRegularity): number` → 0–100:
- occurrences: 3→60, 4→70, 5→78, 6+→85 (capped contribution).
- amount stability: `+ (1 - min(cv/0.15, 1)) * 10`.
- cadence regularity: gap stdev/median → `+ (1 - min(ratio, 1)) * 5`.
- Clamp to [0,100]; floor 60 (below → not surfaced). Stored in the audit row
  for later tuning. Monotonic in occurrences and stability (unit-tested).

### 6. Scope + suppression
- Private only: `group_id === null`, paid rows. Group scope deferred.
- Suppression is the detector's `decided` set (accepted or rejected signatures
  from `suggestion_events`). A rejected pattern never re-nags; an accepted one
  becomes a real template and self-excludes via the template check.

### Files (anticipated)
- `supabase/migrations/20260724000000_suggestion_events.sql`
- `src/lib/services/recurring-detect.ts` (new) + test
- `src/lib/services/suggestions.ts` (new) + test (pure parts)
- `src/lib/services/dashboard-actions.ts` (+ `recurring_suggested` kind)
- `src/lib/components/dashboard/DashboardActions.svelte`
- `src/routes/dashboard/+page.svelte` (wire detector + decided query)
- `messages/pl.json` (+ paraglide)
- `src/lib/supabase.types.ts` (regen)

### Query invalidation
Accept/reject/undo invalidate `["transactions"]` (prefix-matches cash-history +
dashboard forward queries), `["suggestion-events"]`, `["plan-progress"]` where
relevant, mirroring existing mutation patterns.

## Testing & gates
- unit: detector (qualifies at 3 + monthly/weekly cadence + low CV; rejects
  irregular gaps / high CV / <3; excludes templated + decided signatures;
  counterparty normalization; day/weekday inference; median amount).
- unit: confidence monotonicity + floor + clamp.
- RLS: `suggestion_events` owner-only read/write; non-owner cannot see/insert.
- E2E: seeded repeating private expense → suggestion appears with a confidence
  chip → ✓ creates a recurring series (next occurrence shows) → Cofnij reverts;
  × rejects and it stays gone on reload.
- svelte-check 0/0, lint 0, format clean, Svelte MCP clean on edited components,
  paraglide recompiled, `supabase db reset` clean through `20260724`, secret
  scan clean.

## Risks
- Counterparty normalization is the accuracy lever — over-normalizing merges
  distinct payees, under-normalizing misses repeats. Keep it documented +
  unit-tested; conservative defaults; tune via stored confidence later.
- Accept flips an existing historical tx to a template; undo must fully restore
  prior recurrence state (capture it before mutating) and remove materialized
  rows. Unit/E2E pin the round-trip.
- Detection runs client-side over already-fetched rows; if the dashboard's
  lookback window is shorter than 180 days, extend that query or detect over a
  dedicated lookback query (decide in the plan; prefer reusing fetched rows if
  the window already covers ≥180 days, else add one private lookback query).

## Out of scope
- Domain B (category-rule suggestions) and Domain C (settlement surfacing).
- Group-scope suggestions.
- Standalone audit / undo-history UI (v1 undo = toast; audit row stores the
  handle for a future history view).
- Intervals > 1 and cadences other than weekly/monthly.
