# PR 0 — Truthful-copy containment (execution spec)

Status: ready to implement. Scope: `apps/web-svelte/messages/pl.json` + Paraglide recompile. No behavior change, no schema, no TS logic.

## Goal
Stop the product from asserting behavior that is false *today*. This PR only removes/softens false claims; later phases re-align copy when they fix the underlying behavior (each behavior PR owns its own re-align). Keep changes minimal and honest.

## Principle for wording
- Prefer accurate, neutral, actionable copy.
- Where a claim describes a future-phase fix (recurrence history-safety, full export), remove the guarantee now; the owning phase restores a truthful version.
- Do not introduce new message keys unless a string is referenced from code by a new name (none needed here — all edits are value-only).

## Exact edits (`apps/web-svelte/messages/pl.json`)

Line numbers are current-state anchors; match by key.

1. `glossary_short_import` (L737) — currently: "Wgraj wyciąg z banku. Czyste wpisy zapisują się od razu, reszta czeka na krótki przegląd."
   - Problem: all rows stay in preview until commit; nothing "zapisuje się od razu".
   - New: "Wgraj wyciąg z banku. Czyste pozycje są gotowe do zatwierdzenia od razu, reszta czeka na krótki przegląd."

2. `glossary_long_import` (L738) — currently: "...Duplikaty się składają, a nieznane kategorie potwierdzasz w Inne."
   - Problem: duplicates are skipped/manually restored, not merged.
   - New: "...Duplikaty są pomijane (możesz je przywrócić ręcznie), a nieznane kategorie potwierdzasz w Inne."

3. `bank_review_all_duplicates_skip_body` (L367) — currently: "...Możesz przejść do podsumowania i zatwierdzić import (puste) albo wrócić i przywrócić duplikaty."
   - Problem: commit is disabled at zero importable rows, so "zatwierdzić import (puste)" is impossible.
   - New: "...Wróć i przywróć duplikaty albo zamknij import — nie ma pozycji do zatwierdzenia."

4. `settings_export_body` (L528) — currently: "Pobierz pełny eksport JSON: transakcje, kategorie, reguły, plany, warunki kredytów, grupy, importy, majątek netto i profil."
   - Problem: export is incomplete (Phase 7); "pełny" is false.
   - New (informational until Phase 7 defines the contract): "Pobierz eksport JSON widocznych danych: transakcje, kategorie, reguły, plany, warunki kredytów, grupy, majątek netto i profil. Eksport ma charakter informacyjny i może nie zawierać wszystkich danych."

5. `bank_import_leave_save` (L305) — currently: "Zapisz roboczą"
   - Problem: no save happens on leave; edits are already persisted.
   - New: "Zostaw wersję roboczą"

6. `glossary_long_cykliczne` (L762) — currently: "...Możesz je edytować, rozliczyć albo pominąć bez psucia historii."
   - Problem: contradicted by the recurring deletion defect (fixed in PR 2C).
   - New (drop the guarantee until 2C): "...Możesz je edytować, rozliczyć albo pominąć pojedyncze wystąpienie."

7. `rules_intro` (L135) and `rules_empty_hint` (L137) — imply rules are created explicitly via "Zapisz regułę".
   - Problem: today the review learns silently on category selection (fixed in PR 5C). The intro copy is actually the *desired* behavior; keep it, but do not add stronger consent language yet.
   - Action: no change in PR 0 (copy already describes the intended opt-in). PR 5C makes the behavior match this copy. Noted here so PR 5C does not need copy edits for these two keys.

8. `tour_welcome_body` (L702) — "...Polecam i pozdrawiam!"
   - Problem: unclear/patronizing, not actionable.
   - New: "Przed Tobą krótki przewodnik po najważniejszych miejscach w apce. Zajmie kilka minut."

9. `tour_welcome_demo` (L703) — "Chętnie skorzystam!"
   - Problem: does not disclose demo financial records will be created.
   - New: "Pokaż na przykładowych danych" (disclosure of demo data creation handled fully in Phase 9; this is the honest short label).

10. `tour_welcome_import` (L704) — "Świadomie pomijam, wiem co robić."
    - Problem: unclear; the real-data path is missing (Phase 9 wires "Mam już wyciąg" → import). For PR 0, make the label honest to *current* behavior (it dismisses onboarding).
    - New: "Pomiń przewodnik"
    - Note: Phase 9 replaces this with the real "Mam już wyciąg" → import action; PR 0 only removes the patronizing/unclear phrasing.

## Non-goals
- No new import/export/recurrence behavior.
- No onboarding flow changes (Phase 9).
- No changes to keys referenced only by code names.

## Steps
1. Edit the 9 values above in `apps/web-svelte/messages/pl.json` (item 7 is a no-op).
2. Recompile Paraglide (from `apps/web-svelte/`):
   `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`
3. Gates: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint`, `pnpm format:check`, secret scan on changed files.

## Tests
- No unit/E2E logic changes. If any E2E asserts the old strings, update those assertions in the same PR. Grep before finishing:
  - `rg -n "Polecam i pozdrawiam|Chętnie skorzystam|Świadomie pomijam|Zapisz roboczą|zatwierdzić import \(puste\)|pełny eksport JSON|bez psucia historii" apps/web-svelte`
  - Check `apps/web-svelte/e2e` and `apps/web-svelte/tests` for the old literals.

## Commit (suggested)
- `fix(copy): remove demonstrably false import/export/recurrence/onboarding claims`
  - Body: explains each false claim vs actual behavior; notes behavior fixes land in PR 2C/5C/Phase 7/Phase 9 which will re-align copy.
  - Files: `apps/web-svelte/messages/pl.json`, `apps/web-svelte/src/lib/paraglide/**` (generated), any touched E2E/test assertions.

## Branch
`fix/truthful-copy-containment` off current `dev`.
