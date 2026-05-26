# Phase History

Historical record of completed migration phases. Extracted from `CLAUDE.md` (2026-05-26) to keep the live handoff doc lean. Active status, workflow rules, and open backlog stay in `CLAUDE.md`.

## Master phase table

| Phase                                                                                                                                                                                                                       | Status                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0–4                                                                                                                                                                                                                         | ✅ Done                                                                                                       |
| 5.1–5.5 — mutations, Edge Fns, push                                                                                                                                                                                         | ✅ Done + deployed to prod                                                                                    |
| Gap fixes (2026-04-29) — shared tx badge, clickable category breakdown, admin role toggle+search, in-app notifications bell                                                                                                 | ✅ Done                                                                                                       |
| Gap fixes (2026-04-29) — multi-month date range filter, tx detail sheet on row click, shopping list item suggestions                                                                                                        | ✅ Done                                                                                                       |
| 5.6 — CSV import/export + status filter + duplicate shopping list                                                                                                                                                           | ✅ Done                                                                                                       |
| 5.7 — Retire `portfelik-bff/`                                                                                                                                                                                               | ✅ Done (2026-04-30) — directory deleted, no URL refs existed                                                 |
| Gap fixes (2026-04-30) — shopping list rename + offline indicator                                                                                                                                                           | ✅ Done                                                                                                       |
| 7 — Cutover                                                                                                                                                                                                                 | ✅ Done (2026-05-01) — src/, functions/, Firebase configs deleted.                                            |
| 8 — Hardening — see sub-table                                                                                                                                                                                               | ✅ Done (2026-05-09)                                                                                          |
| 10 — UX refresh (design tokens, UI primitives, navigation shell, page sweeps, dashboard, mobile filter drawer, search, batch CSV, notification enum) — see sub-table                                                        | ✅ Done (2026-05-13) — 16 commits merged to `dev`, staging green, T15 enum migration applied to prod Supabase |
| 11 — UX polish (optimistic shopping mutations, sticky FAB, ProgressRing, dashboard wins widget, completion confetti, typography bump; follow-up: FAB bottom-nav clearance + `shopping_lists.completed_at`)                  | ✅ Done (2026-05-13)                                                                                          |
| 11.1 — Shopping-list P0 bug fixes (form-clear timing, whole-row click + kebab/long-press rename, cross-route summary invalidation) + 3 Playwright regression specs                                                          | ✅ Done (2026-05-14)                                                                                          |
| 11.2 — Data integrity hardening (`shopping_list_items.name` + `shopping_lists.name` → `length(btrim) > 0` check constraint; service-level `.trim()` guards; trimmed `"Bułka "` → `"Bułka"` in prod)                         | ✅ Done (2026-05-14)                                                                                          |
| 11.3 — Config & infra hygiene (admin redirect → toast + redirect; push banner 30-day localStorage cooldown; vault rotation runbook at `docs/runbooks/secret-rotation.md`; localhost OAuth redirect URL whitelisted by user) | ✅ Done (2026-05-14)                                                                                          |
| Playwright MCP sweep follow-up — local dev with Spec #1 + Phase 11.2 + 11.3 — all 3 Spec #1 fixes verified in real browser                                                                                                  | ✅ Done (2026-05-14) — see `docs/superpowers/specs/2026-05-14-playwright-sweep-findings.md`                   |

## Phase 8 — Hardening (deferred UX + quality)

| Sub-item                                                                                                         | Status                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark mode (`dark:` variants + `prefers-color-scheme`)                                                            | ✅ Done — `87121e2`, `c7acf3b`, `621f487`, `f3755a0`                                                                                                                             |
| Bulk delete transactions (row selection + delete selected)                                                       | ✅ Done — `8d37fec`                                                                                                                                                              |
| Playwright e2e (mocked, login + transactions + shopping lists flows)                                             | ✅ Done — `75dd6fd`, `86f6ebb`, `8ae80c3`, `3412ebb`                                                                                                                             |
| GitHub Actions CI/CD (typecheck + lint + e2e gating prod deploy)                                                 | ✅ Done — `89f3e73`                                                                                                                                                              |
| Staging deploy — `dev` branch → `dev.portfelik.pages.dev`                                                        | ✅ Done (2026-05-09) — verified green on push to `dev`; uses `cloudflare/wrangler-action@v3` (legacy `pages-action@v1` was Node 20 deprecated)                                   |
| Real-DB smoke suite — runs against staging post-deploy                                                           | ✅ Done (2026-05-09) — full chain green: ci → mocked e2e → deploy-staging → smoke (real Supabase round-trip via dedicated test user, sentinel-tagged data, RLS-isolated)         |
| `/admin/notifications` diagnostic page (legacy parity)                                                           | ✅ Done (2026-05-08)                                                                                                                                                             |
| Old infra cleanup — `tools/migrate/`, `apps/web-react/`, `functions/`, `portfelik-bff/`, `firestore.*`           | ✅ Done — directories already gone; `firebase_uid` column was planned but never applied (no migration needed). Local untracked `dist/` from old React build is safe to `rm -rf`. |
| Architecture audit + docs (`docs/architecture/`) — overview, ER + DB doc, 5 flow diagrams, 10 ADRs, audit report | ✅ Done (2026-05-09) — see `docs/architecture/README.md` and `docs/architecture/audit-2026-05-09.md`                                                                             |

## Phase 10 — UX refresh (2026-05-11 → 2026-05-13)

| Sub-item                                                                                                  | Status                                                          |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| W1 — slate/emerald design tokens, `transition-colors` baseline in `app.css`                               | ✅ Done — `7b70b0f`                                             |
| W2 — UI primitives: `Button`, `Input`, `Select`, `Badge`, `Sheet`, `Dialog`/`ConfirmDialog` migration     | ✅ Done — `b480ee7`, `adc2bd3`, `16b21b9`, `c20d047`, `62f24b2` |
| W3 — `Navigation` shell + `+layout.svelte` slate tokens, mobile hamburger sheet, focus rings              | ✅ Done — `885e87b`                                             |
| W4 — page sweeps: transactions, shopping lists (+ skeleton), settings/admin/login                         | ✅ Done — `6b25fa7`, `ef11131`, `557dc39`                       |
| W5a — `/dashboard` route + root redirect, greeting, monthly summary, upcoming/overdue (max 5), mobile FAB | ✅ Done — `dd17e03`                                             |
| W5b — `FilterDrawer` mobile Sheet w/ Apply/Clear + active-filter count badge                              | ✅ Done — `d2b2ad6`                                             |
| W6a — client-side description search (`$derived` `visibleTxs`), desktop Input + mobile drawer field       | ✅ Done — `9bdcc67`                                             |
| W6b — `bulkCreateTransactions` service + batched CSV import                                               | ✅ Done — `3478bf1`                                             |
| W6c — `notification_type` Postgres enum + `Notification` discriminated union                              | ✅ Done — `6ec68aa` (migration applied to prod 2026-05-13)      |

## Phase 9 — Post-audit quality items (from `docs/architecture/audit-2026-05-09.md`)

Open items (Vault secret rotation runbook, Dexie offline outbox) are tracked in `CLAUDE.md` backlog; the rest below are done.

| Item                                                                                             | Severity | Status                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS regression test suite (Vitest, two JWTs)                                                     | Medium   | ✅ Done 2026-05-13 — `apps/web-svelte/tests/rls/` (9 spec files, 42 tests, local Supabase)                                                                                                        |
| Function `search_path` pinning on all SECURITY DEFINER fns (security advisor)                    | Medium   | ✅ Already complete — all 28 SECURITY DEFINER fns pin `search_path`                                                                                                                               |
| Four FK-covering indexes + two `auth.jwt()` initPlan wraps (perf advisor)                        | Medium   | ✅ Done 2026-05-13 — 4 FK indexes added (`20260514000000_phase9_fk_indexes.sql`); `auth.jwt()` wraps already in place (advisor false-positive on 2 nested-EXISTS forms)                           |
| **EMERGENCY**: `profiles.role` self-elevation via column-grant supersession (caught by P1 suite) | High     | ✅ Patched 2026-05-13 — `20260514000001_phase9_lock_profile_role.sql`                                                                                                                             |
| CI hardening + pure unit tests (blocking Gitleaks scan, `format:check`, PR checklist, isolated `test:unit`) | Medium   | ✅ Local 2026-05-24 — upstream `ci` now gates downstream RLS/e2e/deploy on format, unit tests, and full-history Gitleaks; unit Vitest config stays separate from Supabase-dependent RLS/import config |
| `notifications.type` Postgres enum + `data` jsonb schema                                         | Low      | ✅ Done in Phase 10 — `6ec68aa` (enum part; `data` jsonb schema deferred — payload-by-type still untyped at DB layer)                                                                             |
| Edge Function `deno.json` for each of 3 functions                                                | Low      | ✅ Done 2026-05-13 — per-function `imports` map pinning `@supabase/supabase-js`, edge runtime types, `web-push`                                                                                   |
| pg_cron DST documentation                                                                        | Low      | ✅ Done 2026-05-13 — `supabase/CLAUDE.md` "Scheduled jobs" section                                                                                                                               |
| Migration drift — normalize production `supabase_migrations.schema_migrations` history           | Low      | ✅ Done 2026-05-24 — prod history rewritten to mirror `main` (32 rows, runtime-timestamp + orphan rows cleared); backup `supabase_migrations.schema_migrations_backup_20260524` kept for rollback |

## Bank CSV import V1 — completed steps

| Step | Status |
| ---- | ------ |
| 1 — Design spec | ✅ Done (`7f41b40`) |
| 2 — Pure CSV parsers + mBank/ING adapters + tests | ✅ Done (`c988707`, `8b40da2`) |
| 3 — Schema + RLS (5 tables, 0 cols on tx) + RLS tests | ✅ Done (`91fc886`) — applied to prod via MCP |
| 4 — `commit_import_session` RPC + service layer + 13 RPC tests | ✅ Done 2026-05-21 — migration `20260521000000` applied to prod |
| 5 — UI wizard at `/transactions/import` (BankAccountPicker, FileUpload, ReviewTable, CommitSummary) + entry-point link on `/transactions`; legacy Portfelik-CSV import removed | ✅ Done locally 2026-05-21 — svelte-check 0/0, lint clean, 128/128 vitest |
| 5.1 — Review findings F1–F4 (re-upload detection, pre-commit `preview_fingerprint_warnings`, commit-time dup audit, Tailwind opacity classes) | ✅ Done 2026-05-21 — migration `20260521000001` applied to prod |
| 5.2 — Walkthrough polish (auto-detect bank, 3-step pill, counterparty primary, auto-flip decision, sticky bars, safer cancel wording) | ✅ Done on `dev` 2026-05-21 — e2e browser walkthrough verified against real ING fixture |
| 5.3 — Cloud grant hotfix `20260521000002_bank_import_table_grants.sql` | ✅ Applied to prod 2026-05-21; fixes staging 403/42501 on `bank_accounts` |
| 5.4 — Date-context navigation hotfix (import success + dashboard links preserve period) | ✅ Done locally 2026-05-21 |
| 5.5 — Transactions table sorting (desktop headers toggle date/desc/category/status/amount; mobile day groups follow) | ✅ Done locally 2026-05-21 |
| Dashboard AI observability module ("Sygnały z okresu") | ⏸️ Parked locally 2026-05-24 until core product stable |
| 6 — Save-as-rule + categorization rules engine + masked LLM suggested_category | ⏳ Backlog |

## Shopping-list stabilization — completed bundle

| Task | Status |
| ---- | ------ |
| 1–6 — Attach direction flip + quick-add qty/unit + focus-gated combobox + item edit + list progress clarity | ✅ Local on `dev` 2026-05-22 |
| Unit combobox presets + custom entry (defaults szt., offers kg/opak./l) | ✅ Done locally 2026-05-23 |
| Item category sections + editable vocabulary (`shopping_list_items.category`, owner-scoped `shopping_item_categories`) | ✅ Local 2026-05-24 |
| 7 — Mocked Playwright stabilization bundle | ✅ Local on `dev` 2026-05-24 — 16/16 green |
| 8 — Bank-import warning migration `20260523000000_warn_shopping_list_duplicates.sql` | ✅ Pushed on `dev` 2026-05-22 |
| 9 — RLS coverage for private/group-visible list-created warning candidates | ✅ Pushed on `dev` 2026-05-22 — 10/10 green |
| 10 — Full gates, docs, staging verification | ✅ Local closeout 2026-05-24 — Vitest 153/153, Playwright 16/16 |
| 11 — Shopping-list detail UI closeout | ✅ Local 2026-05-24 — 16/16 |
| 12 — P2 badge review fixes (deep-link by ID outside date filter; delete Undo only after confirm) | ✅ Local 2026-05-24 — Playwright 23/23 |
| Supabase ops cleanup — CLI-state ignore + guarded dispatcher + runbook (`./scripts/supabase-ops.sh help`) | ✅ Local 2026-05-22 |
| Production migration-history normalization | ✅ Done 2026-05-24 — backup `schema_migrations_backup_20260524` |
