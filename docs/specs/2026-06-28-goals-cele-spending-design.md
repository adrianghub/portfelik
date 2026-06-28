# Goals, Cele category & motivational spending framing

Date: 2026-06-28
Status: Implemented (slice 1)
Branch base: `dev`

## Problem

Generic expenses on Pulpit feel punitive — balance goes down with no distinction between
discretionary spend and money that advances a save goal. Save-plan settlement already links
**income** to goals, but the dashboard spending surface treats all expenses equally.

## Decisions

| Decision | Choice |
| --- | --- |
| Route | Save goals live on `/plans` (`kind=save`); no `/goals` route |
| Save settlement | Income-only (DB constraint `save→income`); unchanged |
| Goal-oriented expenses | New seeded category **`Cele`** (expense) for purchases that advance a goal |
| Savings transfers | New seeded category **`Wpłata na cel`** (income) for explicit deposits |
| Dashboard framing | Split period spending: goal-linked income + `Cele` vs other expenses |
| Copy tone | Goal slice uses neutral/emerald framing; discretionary stays factual |

## Schema

Migration `20260724000000_add_cele_categories.sql` extends `seed_default_categories` with
`Cele` (expense) and `Wpłata na cel` (income); backfills existing users idempotently.

## Pure engines

- `goal-spending.ts` — `computeGoalSpendingSplit(txs, saveLinkedIds, celeCategoryId?)`
- `plan-category-hints.ts` — fuzzy match import row text to active save plan titles
- `category-rule-suggestions.ts` — detect ≥3 repeats in `Inne` / uncategorized → rule draft

## UI surfaces

1. **DashboardSpendingInsight** — goal vs other expense strip when split is non-zero
2. **Plan settle (save)** — progress-oriented tagline for income candidates
3. **Import review** — banner offering rule creation for repeated merchants
4. **Import row** — quick-pick `Cele` when description matches a save plan title

## Deferred

- Expense-side save-plan settlement (needs split allocations)
- Treemap tint for goal slice (follow-up polish)
- Gamification / streaks on goal deposits
