# Portfelik — Product Review

**Date:** 2026-06-07
**Trigger:** Pre-launch readiness pass before `dev`→`main` promotion — full review of privacy, security, auth, features, UX, product-direction alignment, and extensibility for gamification / AI.
**Prior review:** none (first `docs/PRODUCT_REVIEW_*.md`)

---

## Executive Summary

Portfelik is in genuine MVP+ shape and close to a defensible public launch. The
core loop (Import → Transactions → Plans → Settlement → Dashboard) is shipped
end-to-end, the data model is disciplined (all money `numeric(12,2)`, RLS on
every table, group writes through SECURITY DEFINER RPCs), and CI is strong
(typecheck, lint, format, secret scan, real-Supabase RLS regression, Playwright
E2E). The biggest strength is the deterministic-engine spine with clean
service→RPC layering — it is well-positioned for the planned AI and gamification
layers without risking financial truth. The most urgent gap is operational, not
architectural: production Supabase advisors flag a handful of WARN-level
hardening items (3 unpinned privacy functions, `anon`-executable legacy/seed
RPCs, leaked-password protection off, `pg_net` in `public`), and the
production-readiness stack (tx co-owner migration, export test, doc syncs) is
still **local-not-committed**. Recommended next action: commit/push the local
stack, ship one hardening migration, then run the gated promotion.

---

## A. Feature Completeness  `8/10`

The product spine is shipped and reachable: Pulpit (`/dashboard`), Transakcje
(`/transactions`), Import (`/import`), Plany (`/plans` + `[id]`, `settle`,
`scenarios`), Ustawienia (`/settings`), plus admin (`/admin`,
`/admin/notifications`) and `/privacy`. Bank import is a full exception-review
surface with a 5-bank adapter registry (mBank, ING, Erste, Millennium, PKO BP),
duplicate folding, and the `Inne` confirmation path. Plans are first-class with
save/debt/spend kinds, settlement via `plan_transaction_links`, net-worth strip,
monthly surplus, and Belka debt scenarios. Couples collaboration ships with
role-based co-owner RLS for plans, debt terms, and (in the uncommitted
migration) transactions. Legacy shopping-list routes are clean `301` redirects
to `/plans` — no orphaned navigation. Every nav entry resolves on both mobile
pill nav and desktop.

**Gaps:**

- ~~The "production-readiness stack" is **local-not-pushed**~~ **Update (post-review):** landed on `dev` in `3c516f6`, `723f181`, `a2e444d`. Remaining local-only: `DebtPlanDetail.svelte` svelte-check fix + `scripts/pr-gates.sh` paraglide-before-format tweak (gate blockers from first `open-pr.sh` attempt).
- No manual emergency-transaction fallback from plan detail (consciously deferred to V1+).
- Notification bell, admin panel, and group invite/accept flows have no E2E coverage (see B).

---

## B. Test Coverage  `8/10`

Coverage is a real strength. 34 RLS specs cover every table and the privileged
RPC surface (commit_import_session, mark_preview_duplicates, transfer ownership,
co-owner roles, max_user_cap, privacy_diagnostics). 17 unit specs cover the
deterministic engines (dashboard-daily, debt-amortization, financial-surplus,
financial-snapshots, plan-settlement, plan-debt, recurrence, polish-plural,
utils, account-export). Import parsers each have a spec (csv-parse, normalize,
registry + per-bank). Component tests cover the comboboxes. CI runs the RLS suite
against a live local Supabase stack with an ephemeral password, plus Playwright
E2E (login, transactions, plans, plan-settle, bank-import, a11y-spine, smoke).

**Gaps:**

- `services/groups.ts` and `services/categorization-rules.ts` have no dedicated unit/service test (groups exercised indirectly via RLS specs only).
- `services/debt-payment-detect.ts` has no unit test despite being pure logic.
- No E2E for group invite→accept, notification bell/popover, or admin panel drill-down.
- New `account-export.spec.ts` is written but not yet committed or run in CI.

---

## C. Development Workflow  `8/10`

CI is comprehensive and three-tier (`ci.yml`, `deploy-staging.yml`,
`deploy-production.yml`) all enforce typecheck + lint + `format:check` + unit +
component + gitleaks secret scan + RLS regression + Playwright. PR template
exists. Branch-sync discipline (main→dev→feature→dev→main) is documented in
CLAUDE.md. Migration discipline is followed: one file per change, sequential
timestamps `20260423`→`20260622`, no amendments to applied migrations, idempotent
naming.

**Gaps:**

- Local production-readiness work is uncommitted (see A) — the documented "immediate next step" is blocked on this commit.
- No automated `get_advisors` gate in CI; security/perf lints are caught only by manual MCP runs.

---

## D. Security  `7/10`

Strong baseline. Local DB confirms **46 SECURITY DEFINER functions in `public`,
0 with unpinned search_path**. RLS is enabled on every table; group mutations go
exclusively through SECURITY DEFINER RPCs with direct writes blocked by
`USING (false)`. `profiles.role` has `REVOKE UPDATE` from authenticated. Secret
scanning (gitleaks with pinned SHA) runs in CI. Privacy Layer 1 masked admin
diagnostics is shipped. Secret-rotation and ops-access-lockdown runbooks exist.
Push secrets and `INTERNAL_TRIGGER_SECRET` are set in prod Edge Function secrets.

Production `get_advisors(security)` returns **WARN-only, no ERROR** (no missing
RLS, no exposed tables). Open WARN items:

**Gaps:**

- 3 privacy helpers (`privacy_amount_bucket`, `privacy_mask_email`, `privacy_mask_text`) are `SECURITY INVOKER` with **no `search_path` pin** (consistent local+prod, not drift). Lower risk than a definer, but should be pinned.
- `anon` role can execute 3 SECURITY DEFINER RPCs over REST: `complete_shopping_list` (legacy — shopping lists retired), `seed_default_categories`, `seed_default_categories_on_profile`. Revoke `EXECUTE` from `anon`; `complete_shopping_list` should be dropped entirely.
- Supabase Auth **leaked-password protection is disabled** (HaveIBeenPwned check off). Low impact (prod login is Google OAuth) but a one-toggle fix.
- Extension `pg_net` installed in `public` schema (hardening WARN).

---

## E. Backend Patterns & Database  `8/10`

Clean and consistent. All money columns verified `numeric(12,2)`
(transactions.amount, plans.budget/target_amount, plan_debt_terms.*,
financial_snapshots.*, import_rows.amount); interest rate is `numeric(7,4)`. FK
indexes shipped (`20260514000000_phase9_fk_indexes`), with a deliberate
`20260530000000_index_cleanup` that resists speculative indexes. Hard deletes
throughout (no soft-delete drift). New tables (plans, plan_transaction_links,
plan_debt_terms, financial_snapshots, group_member_roles) all have RLS + RLS
regression specs. Explicit table GRANTs accompany new public objects per the
post-2026-05-30 rollout. max_user_cap enforced at DB level
(`20260526`/`20260527`) with an RLS spec.

**Gaps:**

- Legacy `complete_shopping_list` RPC still exists on prod though shopping lists are retired from the app surface — dead, anon-executable attack surface that should be dropped.
- No automated performance-advisor check; pagination while-loop accumulators (PostgREST 1000-row pages) are fine at current scale but unmonitored.

---

## F. Frontend Patterns & Svelte  `8/10`

Mature design system. Dark-neon palette via oklch tokens, `color-mix` surfaces,
runtime-overridable accent (`applyAccent`), typography scale, motion tokens
(`--duration-fast/base/slow`, `--ease-out-expo`), safe-area-aware mobile action
spacing, accent-tinted scrollbars. Rich UI primitive set (Button, Input, Dialog,
Sheet, Badge, Card, EmptyState, ProgressRing/Bar, Fab, Breadcrumbs, Combobox
variants) — features compose these rather than inline HTML. Svelte 5 runes
throughout, TanStack Query v6, Paraglide v2 compile-time i18n, static SPA
(`adapter-static`, no SSR, no `+server.ts`). Progress rings + surplus/net-worth
cards already give a gamification-ready visual vocabulary.

**Gaps:**

- `svelte-check 0/0` and `pnpm lint` were not re-run in this read-only pass against the uncommitted changes — must be confirmed green before promotion.
- `pl.json` edited; Paraglide recompile must be confirmed so new keys resolve in `svelte-check`.

---

## G. Architecture & Structure  `9/10`

Textbook layering: route `+page.svelte` → `services/*.ts` → Supabase RPC/PostgREST.
17 cohesive services, no stray `.ts` at `lib/` root, domain-grouped components
(admin/dashboard/import/plans/settings/transactions/ui), import engine isolated
under `lib/import/{banks,csv}`. Static-adapter constraint respected. No orphaned
routes — legacy paths are intentional redirects. Deterministic engines
(amortization, surplus, snapshots, settlement, categorize) are pure and
testable, cleanly separated from UI and from any future AI layer.

**Gaps:**

- Minor: `services/` is flat at 17 files; if debt/savings/net-worth grows, a `plans/` service subfolder may be worth it later. Not urgent.

---

## H. Documentation  `8/10`

Extensive and current. CLAUDE.md phase table, infra map, and immediate-next-step
are accurate. `docs/product/` carries product-direction + intent-oriented-ui
doctrine; `mvp-hardening.md` tracks phases with explicit complete/in-progress/
deferred tables. `docs/architecture/` has README + ADR dir + database.md.
`docs/runbooks/` covers secret-rotation, ops-access-lockdown, supabase-operations.
Legal privacy-policy.md present and synced with groups/snapshots/export/push.

**Gaps:**

- `docs/architecture/database.md` is modified but uncommitted — ensure it lands with the new tx co-owner + plan tables.
- No ADR yet for the role-based co-owner authorization model (a significant, durable decision worth recording).

---

## I. Roadmap & North Star  `9/10`

North star alignment is excellent: spending visibility + shared household
expenses, mobile-first, low friction. The import-first loop is fully realized and
the "AI proposes, deterministic engines dispose, users decide exceptions" law is
honored — no probabilistic path can mutate financial truth. Deferred items (Dexie
offline outbox, AI suggestions/clustering, split allocation, column encryption)
are correctly post-launch and not blocking. Overengineering risk is low; the
deterministic spine + progress-ring/surplus UI is a clean substrate for both
gamification (streaks, goal progress, badges over existing snapshots) and AI
(explanations/summaries over existing engines).

The offline-write gap is **safely deferred** — the app is online-first with
optimistic TanStack mutations; no evidence of real UX failure, just a parity gap
vs. the legacy Firestore client. Single highest-impact next feature for the
target user: **deterministic plan-matching suggestions on settlement** (scores +
reasons) — it directly compounds the import→settle loop and is the natural first
home for the "AI explains" layer.

---

## Scorecard

| Dimension              | Score | Key finding |
|------------------------|-------|-------------|
| Feature completeness   | 8/10  | Spine shipped + reachable; readiness stack uncommitted |
| Test coverage          | 8/10  | 34 RLS + 17 unit + E2E; groups/rules service tests thin |
| Dev workflow           | 8/10  | Strong CI; local work unpushed, no advisor gate |
| Security               | 7/10  | 46 SECDEF all pinned; WARN-only prod advisors to close |
| Backend patterns       | 8/10  | numeric(12,2) everywhere; legacy RPC lingers |
| Frontend patterns      | 8/10  | Mature token system + runes; recompile/check to confirm |
| Architecture           | 9/10  | Clean route→service→RPC; no orphans |
| Documentation          | 8/10  | Current + runbooks; co-owner ADR missing |
| North star alignment   | 9/10  | Loop realized; AI/gamification-ready substrate |
| **Overall**            | **8/10** | Launch-ready pending commit + 1 hardening migration |

---

## Action Checklist

### Must close before any new feature

- [ ] **Commit + push the production-readiness stack.** Stage and commit (split by concern): migration `supabase/migrations/20260622000000_transaction_co_owner_writes.sql`; `tests/unit/account-export.spec.ts`; modified `messages/pl.json` (+ Paraglide recompile), `routes/plans/+page.svelte`, `routes/plans/[id]/+page.svelte`, `routes/privacy/+page.svelte`, `tests/rls/transactions.spec.ts`, `docs/architecture/database.md`, `docs/legal/privacy-policy.md`, `docs/product/mvp-hardening.md`, `CLAUDE.md`.
- [ ] **Run the gates green:** from `apps/web-svelte/`: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint`, `pnpm format:check`, then `supabase db reset` + `pnpm test:rls` (RLS suite green).
- [ ] **Ship one security-hardening migration** before promotion: pin `search_path` on `privacy_amount_bucket` / `privacy_mask_email` / `privacy_mask_text`; `REVOKE EXECUTE ... FROM anon` on `seed_default_categories`, `seed_default_categories_on_profile`; and `DROP FUNCTION public.complete_shopping_list(...)` (legacy, anon-executable, shopping lists retired).

### High value, low overengineering risk

- [ ] Enable Supabase Auth **leaked-password protection** on prod + staging (dashboard toggle).
- [ ] Move `pg_net` out of the `public` schema (advisor `0014`).
- [ ] Add a CI step (or pre-promotion checklist) that runs `get_advisors(security)` and fails on any ERROR.
- [ ] Re-run `get_advisors` after the hardening migration to confirm the WARN count drops.

### Medium term

- [ ] Add service-level unit tests for `groups.ts`, `categorization-rules.ts`, and `debt-payment-detect.ts`.
- [ ] Add E2E for group invite→accept, notification bell/popover, and admin panel.
- [ ] Write an ADR for the role-based co-owner authorization model.

### Consciously deferred (and why)

- Dexie offline write outbox — app is online-first with optimistic mutations; no observed UX failure, parity-only gap.
- AI explanations / clustering / draft suggestions — depends on deterministic plan-matching landing first; no financial-truth risk to defer.
- Split allocation (tx → multiple plans) — needs design before build; deferring avoids premature schema lock-in.
- Privacy Layer 3 column encryption — Layer 1 masking covers the launch threat model.

---

*Generated by `/reflect` on 2026-06-07. Update CLAUDE.md "Immediate next step" after closing must-close items.*
