# Error handling (UI/UX) — design

**Date:** 2026-06-21
**Status:** approved design, pre-implementation
**Scope:** mapper + key write/read flows (admin + import internals out of scope)

## Problem

Failures surface as a blanket `toast.error(m.toast_error())` ("Coś poszło nie tak")
or a generic query-error block (`m.common_error_title()`). Users get no actionable
signal — a permission error, a duplicate, and a dropped connection all read the
same. The recent `42501` on transaction edit was invisible as a *permission*
problem because the copy never said so.

The bones already exist: `services/supabase-errors.ts` *extracts* a PostgREST
error (code/message) but does not map it to friendly copy; `TransactionDialog`
already shows an inline error + toast. This work centralises the mapping and
applies it consistently.

## Approach (chosen: A — pure mapper + thin helpers)

A pure `errorMessage(err)` function plus two thin consumers (a toast wrapper and a
presentational component). Rejected: global `QueryClient.onError` (loses
per-call context, can't drive inline messages, double-toasts) and a typed
`AppError` hierarchy + boundary (services refactor, overkill).

## Section 1 — taxonomy + signature

`errorMessage(err: unknown, opts?: { fallback?: string; overrides?: Record<string, string> }): string`
in `services/supabase-errors.ts`. Pure; returns resolved Polish copy via Paraglide.
`opts.overrides` lets a call-site supply context-specific copy keyed by code (e.g.
delete-category `23503` → "Kategoria jest w użyciu"); `opts.fallback` overrides the
default tail message.

Detection order: **network first** (no code + fetch failure), then code, then fallback.

| Trigger | Mapped copy (new `error_*` key) |
| --- | --- |
| `42501` permission denied | "Brak uprawnień do tej operacji." |
| `23505` unique violation | "Taki wpis już istnieje." |
| `23503` FK in-use | "Nie można usunąć — pozycja jest w użyciu." |
| `23502` / `23514` / `22P02` | "Sprawdź wprowadzone dane." |
| `P0001` custom raise | DB `hint` → else `message` → else generic (triggers set Polish hints) |
| `401` / `PGRST301` / JWT | "Sesja wygasła. Zaloguj się ponownie." |
| network / offline / "Failed to fetch" | "Brak połączenia z internetem." |
| anything else | fallback = "Coś poszło nie tak. Spróbuj ponownie." |

New keys live under an `error_*` namespace in `messages/pl.json` (recompile
Paraglide). `m.toast_error()` / `m.common_error_title()` remain as the generic
fallback wording.

## Section 2 — helpers + component

- **`errorMessage(err, opts?)`** — stays in `services/supabase-errors.ts`. Pure, no
  UI dependency, unit-testable.
- **`toastError(err, opts?)`** — new `lib/toast-error.ts`; imports the toast lib +
  `errorMessage`: `toast.error(errorMessage(err, opts))`. Keeps the toast dep out
  of the pure mapper. One-liner at mutation `onError` sites.
- **`<QueryError error onRetry?>`** — `lib/components/ui/QueryError.svelte`. Renders
  the mapped message + an optional "Spróbuj ponownie" button (`common_retry`) that
  calls `onRetry` (i.e. `query.refetch()`). Dark-card styling; a11y contrast floor
  ≥ `slate-400`, message line `rose-300`. Drop-in for every `{#if q.isError}` block.

Three independently testable units: pure mapper, toast wrapper, presentational
component.

New copy key: `common_retry` = "Spróbuj ponownie".

## Section 3 — call-site rollout (key flows only)

Admin + import internals stay on the generic fallback (out of scope).

**Mutation `onError` → `toastError(err)`** (preserve existing code overrides via
`opts.overrides`, e.g. `CategoriesTab`'s `23503`):

- transactions: `TransactionDialog`, row delete, bulk delete, quick-settle
- plans: create / update / delete, link / unlink settle, debt terms, refinance
- settings: `CategoriesTab`, `RulesTab`, `RuleEditDialog`, `GroupsTab`,
  `ProfileTab`, `PersonalizationTab`

**Inline dialog error → `errorMessage(mutation.error)`** (replaces generic
`common_error_title`): `TransactionDialog`, plan create/edit forms, category/rule
dialogs.

**Query `isError` → `<QueryError error onRetry>`**: transactions list, plans hub,
dashboard cards, settings tabs (`CategoriesTab`, `RulesTab`).

## Section 4 — testing

- **Unit (core safety net):** `errorMessage` table test — `42501`, `23505`,
  `23503`, `23502`, `P0001`+hint, `401`, network (`TypeError: Failed to fetch`),
  fallback, and `overrides` precedence.
- **Component (light):** `<QueryError>` renders the mapped message; `onRetry` fires
  on button click.
- **E2E:** none new — `a11y-spine` already guards contrast on these surfaces;
  mapper logic is unit-covered.

## Out of scope (later)

- Admin and import-internals error surfaces.
- Offline write queue / retry UX.
- Global error boundary / typed error hierarchy.
