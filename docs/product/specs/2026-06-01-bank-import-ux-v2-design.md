# Bank Import UX v2 — Design (issue #73)

Date: 2026-06-01
Branch base: `imp/mvp-hardening-multistep-bank-import-v1`
Issue: https://github.com/adrianghub/portfelik/issues/73

## Problem

Issue #73 is a v2 feedback bundle on the bank-import flow. Concrete complaints:

1. Mobile header control "Import bankowy" is mislabeled (the sheet behind it also
   exports) and verbose; author wants short labels or FAB icons.
2. The multistep flow is "still not intuitive."
3. Duplicate management leads the flow with a dedicated screen. Author wants dups
   implicitly skipped, with an explanation of which/why and an on-demand restore.
4. Categorize step is cluttered ("big text bubbles") with opaque button labels
   "Importuj gotowe" and "Oznacz widoczne jako pominięte" ("gotowe"/"widoczne"
   undefined to a user).
5. "Is save-rule working?" / "Are rules/categories working?" — verification asks.
6. Copy: "nie trafią do księgi" → "nie trafią do transakcji" (+ similar sweep).

## Review findings (current state)

Flow today: `upload → review` stepper, but `review` hides three nested sub-steps
`duplicates → categorize → finalize` — effectively 4 screens behind a 2-pill
stepper. This nesting is the root of "not intuitive."

Correctness bugs found:

- **Bulk scope mismatch** (`ImportReviewFlow.svelte:201-209`): "Importuj gotowe"
  acts on all rows across every filter (`activeRows`); "Oznacz widoczne jako
  pominięte" acts only on the current filter (`visibleRows`). Same toolbar,
  silently different scope.
- **Duplicate auto-mark resync race** (`:136-138`): stale `queryClient` cache can
  revert a user's "Importuj mimo to" if it lands during an in-flight patch.
- **Undo-rule clobbers later edits** (`:211-217`): undo restores the pre-rule
  snapshot, wiping a category the user set manually after the rule applied.
- **Partial rule-apply, no rollback** (`:228-232`): rule created, then a per-row
  patch fails mid-batch → orphan rule, some rows unset.
- **No re-match on description edit**: editing `edited_description` to match an
  existing rule does not re-categorize. Silent miss.
- Minor: `markImport` on an already-import row still attempts rule capture →
  wasteful duplicate-rule RPC (caught, just noisy).

Verification answers to the issue's direct questions:

- **Save-rule works.** Creates a `contains` rule, sets both `match_description`
  and `match_counterparty` from one derived token, applies to uncategorized
  matches, has Undo. Edge cases above are real but not "broken."
- **Rules/categories work.** Preview auto-applies matching rules via
  `insertPreviewRows`/`resolveCategory`; manual override is respected; the rule
  badge is shown. Gap = no re-eval on edit.

Doctrine (`docs/product/intent-oriented-ui.md`) violations:

- Duplicates-first screen foregrounds machinery; doctrine says "hide machinery by
  default, keep advanced reachable."
- 4-screen nesting violates "smallest useful decision surface."
- "gotowe"/"widoczne" labels expose raw mechanics.

## Decisions (steered with user)

- **B** — collapse the review into one surface (no nested sub-steps).
- **A** — default-import: every non-duplicate row imports by default; user acts on
  exceptions only.
- **C** — conditional confirm: commit directly when fully categorized; show a
  confirm sheet only when rows fall to Inne or dups were auto-skipped.
- **A** — header: short labels on all breakpoints, "Import" + "Eksport", no sheet.
- **A** — rules optional: manual categorization never blocks commit; "Zapisz
  regułę" stays an offer; drop the `ensureRulesThenImport` gate.

## Design

### 1. Header control (`TransactionDataActions.svelte`)

Drop the mobile sheet. Render two controls on all breakpoints: **Import**
(Landmark icon) and **Eksport** (Download icon), same pill style. Removes the
mislabeled "Import bankowy" sheet trigger. The `variant` prop collapses to one
render path (desktop/mobile differ only in sizing, not structure).

### 2. Single review surface

`upload → review` remains the only stepper. Inside `review`, no sub-step state
machine. One scrollable surface, top to bottom:

- **Source line** — account / bank kind (existing `bank_review_account_destination`).
- **Duplicate banner** — §3.
- **Compact signal line** — parse-errors and large-import notices shown only when
  present, as one terse line each, not stacked amber boxes. The rules-explainer
  box is removed (folded into the per-row "Zapisz regułę" affordance + a small
  tooltip/hint).
- **Suggestion chips** — repeated-merchant (3+) chips, condensed, collapsible.
- **Filter chips** — Wszystkie / Do skategoryzowania / Przychody / Wydatki. The
  "pending" filter is gone.
- **Table (desktop) / cards (mobile)** — §4.
- **Sticky footer** — live counts + primary commit (§6).

Component changes:

- `ImportReviewFlow.svelte` slims to a thin orchestrator: holds rows, filter,
  banner expand state, footer. No sub-step state, no duplicate epoch machinery.
- `ImportReviewCategorizeStep.svelte` → becomes the surface body (table/cards +
  combobox + per-row skip + rule offer). Keep the name or rename to
  `ImportReviewTable.svelte` (implementation plan decides).
- `ImportReviewDuplicatesStep.svelte` → `DuplicateBanner.svelte` (collapsed
  summary + expandable list).
- `ImportReviewFinalizeStep.svelte` → `ImportConfirmSheet.svelte` (conditional
  confirm dialog/sheet, not a step).

### 3. Duplicates folded

Duplicate-flagged rows are **default-skipped at preview insert**, server-side. The
fingerprint warnings already exist server-side; set `decision='duplicate'` for
flagged rows at `insertPreviewRows` time rather than via a client `$effect`.

Surface as a collapsed banner: "N pominięto jako duplikat — Pokaż". Expanding
reveals the list with per-row **Importuj mimo to** and a **Przywróć wszystkie**
action.

This deletes the entire client-side auto-mark machinery (`$effect`,
`autoDupHandledIds`, `dupEpoch`/`dupMarkEpoch`, `resyncRowDecisionIfStale`,
`scheduleAutoMarkDuplicate`, `waitForAutoDupMark`), eliminating the resync race
(bug #2).

**Risk to confirm in planning:** the dup default must be set where fingerprint
warnings are known at insert time. If warnings are only computable post-insert,
fall back to a single one-shot client mark on first load (no per-render `$effect`,
no epochs) — still removes the race.

### 4. Per-row decision = default-import

At preview insert: non-duplicate rows get `decision='import'`; duplicate-flagged
rows get `decision='duplicate'`. The `pending` decision is no longer a default
state the user must clear.

Per-row controls:

- **Category combobox** — keep `ImportCategoryCombobox` (search + inline create via
  `createCategory`).
- **Skip toggle** — per row; default is importing, toggle to skip. Replaces the
  explicit Importuj/Pomiń `role="group"` control.
- Uncategorized rows still import and land in **Inne** (existing
  `commit_import_session` fallback, migration `20260608000000`).

Bulk actions, both scoped to the **current filter** (`visibleRows`) consistently:

- **Pomiń widoczne (N)** — skip all visible importing rows.
- **Przywróć widoczne (N)** — un-skip all visible skipped rows (shown when the
  filter contains skipped rows).

"Importuj gotowe" is removed. This fixes the bulk-scope mismatch (bug #1).

### 5. Rules optional

Manual categorization never blocks commit. Drop `ensureRulesThenImport` and its
required-rule gate. Keep:

- Per-row **Zapisz regułę** offer when a category is set and no rule matches.
- Proactive repeated-merchant suggestion chips (3+ rows).

Bug fixes folded in:

- **#3 undo-rule clobber:** undo skips rows whose current `selected_category_id`
  no longer equals the value the rule applied (i.e. the user diverged since).
- **#4 partial apply:** on a per-row patch failure mid-apply, surface a toast and
  keep Undo available; do not silently leave an orphan rule unexplained.
- **#5 re-match on edit (low priority):** when `edited_description` changes and the
  row is uncategorized, re-run `matchCategory` and apply a newly matching rule's
  suggestion. May be deferred if it complicates the plan.

### 6. Commit — conditional confirm

Sticky footer: primary button **Zaimportuj N transakcji** with live counts
("N import · M pominięto · K do Inne"). Behaviour:

- All importing rows categorized → commit directly, toast result.
- Some importing rows fall to Inne, or dups were auto-skipped → open
  **`ImportConfirmSheet`** first, listing the Inne-bound rows and the auto-skipped
  duplicates, then commit on confirm.

Same `commit_import_session` RPC. The `rows_pending` gate is irrelevant now that
no row defaults to pending, but keep the RPC guard as defense-in-depth.

### 7. Copy

- `pl.json:362` and `:422`: "nie trafią do **księgi**" → "nie trafią do
  **transakcji**".
- Remove `bank_review_ready_action` ("Importuj gotowe").
- Replace `bank_review_mark_visible_skipped` with "Pomiń widoczne ({count})".
- New keys: per-row skip toggle, "Przywróć widoczne", duplicate banner
  (collapsed summary + expand), confirm-sheet title/body, footer counts, header
  "Import" label if not reusing an existing key.
- Recompile Paraglide after editing `pl.json`.

## Out of scope

- Multiple draft files / concurrent imports (issue point about "more imports").
  Single active preview session + resume banner stays as-is.
- List virtualization for long imports.
- AI category suggestion.

## Testing

- Unit/RLS: dup default at insert, commit with Inne fallback, bulk skip/restore
  scope.
- Playwright bank-import: default-import happy path, skip-an-exception, duplicate
  banner expand + import-anyway, conditional confirm sheet (Inne + dups), header
  Import/Eksport controls on desktop and mobile widths.
- Gates per CLAUDE.md: `svelte-check` 0/0, lint 0, format, secret grep, Paraglide
  recompile.

## Review questions (doctrine self-check)

- Intent: "import my statement, fix the few rows that matter." Default-import +
  exception editing serves it.
- Deterministic: dup detection, rule matching, Inne fallback all server/engine
  side.
- Learn from repeats: optional rule capture + 3+ suggestion chips.
- Smallest surface: one review screen, exceptions only.
- Undo/correct: per-row skip toggle, import-anyway, restore, rule undo.
- Explain when it helps: dup banner ("why skipped"), conditional confirm (Inne).
- AI guard: n/a (no AI in this iteration).
