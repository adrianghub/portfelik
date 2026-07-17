# PR 3C — Categorization rule semantics lock (execution spec)

Status: implemented locally. Closes Phase 3 (DB invariants).

## Goal

Stop editors from silently coercing `type` / `composite` rules into `contains`
(and clearing `match_type`). Matching **kind** is a fixed semantic contract;
change mode via delete + create.

## Root cause

`RuleEditDialog` and `ImportReviewFlow.saveRuleEditor` both rewrote:

```ts
kind: rule.kind === "exact" ? "exact" : "contains"
```

Import also set `match_type: null`, destroying type gates on composite rules.

## Deliverables

### Migration (`20260803090000_categorization_rule_semantics_lock.sql`)

1. Revoke UPDATE on `kind` (keep text/type/day/category/priority grants).
2. `prevent_categorization_rule_semantics_downgrade` BEFORE UPDATE:
   - `rule_kind_immutable` on kind change
   - `rule_match_type_required` if type/composite clears `match_type`
   - `rule_text_required` if text kinds clear both text fields

### Client

- `buildCategorizationRuleEditPatch` — kind-aware patch; never emits `kind`.
- `updateCategorizationRule` accepts `CategorizationRuleUpdate` (no `kind`).
- `RuleEditDialog` + import rule editor: type UI without forced text; preserve
  composite `match_type`; show locked type hint.
- `RulesTab` match summary prefixes kind label.
- Error maps + PL copy.

### Tests

- Unit: patch helper preserves composite type / allows type-only / rejects text wipe.
- RLS: kind flip rejected; match_type clear rejected; type category update ok.

## Gates

- `supabase db reset` through `20260803090000`
- svelte-check 0/0, lint, format
- unit + RLS green for this slice

## Non-goals

- Rule version history table
- SQL-side matcher (client `categorize.ts` remains evaluator)
- P0-5C explicit rule-consent on category pick
