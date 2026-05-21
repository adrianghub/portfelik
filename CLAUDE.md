# CLAUDE.md

## Agent Workflow Rules

Apply to every task regardless of phase.

### After every change
1. **Sanity check** — `pnpm exec svelte-check --tsconfig ./tsconfig.json` (from `apps/web-svelte/`). 0 errors, 0 warnings.
2. **Lint** — `pnpm lint` (from `apps/web-svelte/`). 0 errors.
3. **Format** — `pnpm format:check`; if fails run `pnpm format` then re-check.
4. **Security** — `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>`. Flag anything before proceeding. **Allowlist:** `apps/web-svelte/.env.test.example` intentionally carries public Supabase local-demo JWTs (identical on every `supabase start` install — documented in the Supabase CLI source). Real cloud creds belong in `apps/web-svelte/.env.cloud.local` (gitignored).
5. **Schema validation** — new tables: RLS enabled? Migrations: idempotent naming?

### Before finalising
6. **Paraglide recompile** if `messages/pl.json` touched: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` (from `apps/web-svelte/`).
7. **Commit list** — MANDATORY after every increment. Output:
   - (a) Ordered list of Conventional Commit messages (feat/fix/chore/refactor + scope + body explaining WHY)
   - (b) Exact file list per commit
   - User commits manually. Do not skip this step even if changes seem minor.

### After each increment
8. **Update CLAUDE.md** phase table + "Immediate next step". Update `~/.claude/projects/.../memory/project_state.md`. Stale docs are worse than none.
9. **Handoff notes** — next agent must cold-start from CLAUDE.md alone.

### Increment discipline
- Split by concern: schema / services / components / config. One migration per logical schema change. Never amend applied migrations.

---

## Project Status

**Portfelik** — personal-finance PWA. Migrating React 19 + Firebase → SvelteKit + Supabase. Full plan: `MIGRATION_PLAN.md`.
**Immediate next step:** Bank CSV import V1 — Steps 5 + 5.1 + 5.2 shipped locally 2026-05-21 (upload-first wizard at `/transactions/import` + entry-point link on `/transactions`). **All three migrations applied to prod via MCP** (`20260520000000_bank_import.sql` + `20260521000000_commit_import_session.sql` + `20260521000001_preview_fingerprint_warnings.sql`). Local work still uncommitted — user reviews + commits manually.

Phase 12 shipped through U6 + EmptyState sweep + group hardening (2026-05-17). Highlights:
- Dark-neon UX uplift U1–U6: pill bottom nav, avatar menu, dashboard hero + sparklines + period chips, daily greeting + money quote, drill-down navigation, type filter, ConfirmDialog scale/fade, `prefers-reduced-motion` honored, EmptyState adopted across 6 screens.
- Group hardening (`20260516000000` → `20260517000003`): `transactions.group_id` opt-in with explicit assignment, both `transactions` and `shopping_lists` lock `user_id` immutable, `group_id` reassign owner-only via trigger, `disband_group` raises when group has items, INSERT policies enforce member-only group assignment.
- `attach_shopping_list_to_transaction` RPC connects existing tx to a list with sharing-scope match + ≥1 item guard.
- RLS regression suite 52/52 green (added 7 group/list rules + tx user_id immutability tests).
- Vitest auto-loads `.env.test.example` (committed local defaults) — `pnpm test:rls` works without inline env.

**Bank CSV import V1** — progress sub-table:

| Step | Status |
|---|---|
| 1 — Design spec | ✅ Done (`7f41b40`) |
| 2 — Pure CSV parsers + mBank/ING adapters + tests | ✅ Done (`c988707`, `8b40da2`) |
| 3 — Schema + RLS (5 tables, 0 cols on tx) + RLS tests | ✅ Done (`91fc886`) — applied to prod via MCP |
| 4 — `commit_import_session` RPC + service layer + 13 RPC tests | ✅ Done 2026-05-21 — migration `20260521000000` applied to prod |
| 5 — UI wizard at `/transactions/import` (BankAccountPicker, FileUpload, ReviewTable, CommitSummary) + entry-point link on `/transactions`; legacy Portfelik-CSV import removed (handleImport / parseCSVRow / bulkCreateTransactions / csv_import* i18n keys deleted — no rollback path, bank wizard is the sole import) | ✅ Done locally 2026-05-21 — svelte-check 0/0, lint clean, 128/128 vitest |
| 5.1 — Review findings: F1 re-upload of committed file (`findExistingSession`, "already imported" panel), F2 pre-commit `preview_fingerprint_warnings` RPC + per-row badge + bulk "Skip probable duplicates", F3 commit-time dup updates audit row (`decision='duplicate'`, `duplicate_of=<winner>`) with external_id-first lookup, F4 Tailwind opacity classes (`/10`, `/40`, `/5`) replacing invalid `-N` directives | ✅ Done 2026-05-21 — migration `20260521000001` applied to prod |
| 5.2 — Walkthrough polish: drop upfront bank-kind picker (auto-detect + `findOrCreateActiveAccount`), drop subtitle, 3-step pill (upload/review/done), counterparty as primary description line + bank title as secondary, auto-flip decision on category set/clear, sticky top warnings+bulk bar + sticky bottom commit bar, safer committed-session cancel wording with "to nie cofnie już dodanych transakcji" hint, redundant decision Badge removed (sticky thead deferred to next polish pass — clashed with outer sticky bar) | ✅ Done locally 2026-05-21 — end-to-end browser walkthrough verified F1/F2/F3/F4 + counterparty + auto-decision against real ING fixture |
| 6 — Save-as-rule + categorization rules engine + masked LLM suggested_category | ⏳ Backlog |

Mortgage/debt tracking is a follow-on track.

**Remaining backlog:** Dexie offline outbox (legacy parity, last-write-wins decided), axe-core a11y sweep (deferred U7), staging DB separation.

| Phase | Status |
|---|---|
| 0–4 | ✅ Done |
| 5.1–5.5 — mutations, Edge Fns, push | ✅ Done + deployed to prod |
| Gap fixes (2026-04-29) — shared tx badge, clickable category breakdown, admin role toggle+search, in-app notifications bell | ✅ Done |
| Gap fixes (2026-04-29) — multi-month date range filter, tx detail sheet on row click, shopping list item suggestions | ✅ Done |
| 5.6 — CSV import/export + status filter + duplicate shopping list | ✅ Done |
| 5.7 — Retire `portfelik-bff/` | ✅ Done (2026-04-30) — directory deleted, no URL refs existed |
| Gap fixes (2026-04-30) — shopping list rename + offline indicator | ✅ Done |
| 7 — Cutover | ✅ Done (2026-05-01) — src/, functions/, Firebase configs deleted. |
| 8 — Hardening — see sub-table | ✅ Done (2026-05-09) |
| 10 — UX refresh (design tokens, UI primitives, navigation shell, page sweeps, dashboard, mobile filter drawer, search, batch CSV, notification enum) — see sub-table | ✅ Done (2026-05-13) — 16 commits merged to `dev`, staging green, T15 enum migration applied to prod Supabase |
| 11 — UX polish (optimistic shopping mutations, sticky FAB, ProgressRing, dashboard wins widget, completion confetti, typography bump; follow-up: FAB bottom-nav clearance + `shopping_lists.completed_at`) | ✅ Done (2026-05-13) |
| 11.1 — Shopping-list P0 bug fixes (form-clear timing, whole-row click + kebab/long-press rename, cross-route summary invalidation) + 3 Playwright regression specs | ✅ Done (2026-05-14) |
| 11.2 — Data integrity hardening (`shopping_list_items.name` + `shopping_lists.name` → `length(btrim) > 0` check constraint; service-level `.trim()` guards; trimmed `"Bułka "` → `"Bułka"` in prod) | ✅ Done (2026-05-14) |
| 11.3 — Config & infra hygiene (admin redirect → toast + redirect; push banner 30-day localStorage cooldown; vault rotation runbook at `docs/runbooks/secret-rotation.md`; localhost OAuth redirect URL whitelisted by user) | ✅ Done (2026-05-14) |
| Playwright MCP sweep follow-up — local dev with Spec #1 + Phase 11.2 + 11.3 — all 3 Spec #1 fixes verified in real browser | ✅ Done (2026-05-14) — see `docs/superpowers/specs/2026-05-14-playwright-sweep-findings.md` |


### Phase 8 — Hardening (deferred UX + quality)

| Sub-item | Status |
|---|---|
| Dark mode (`dark:` variants + `prefers-color-scheme`) | ✅ Done — `87121e2`, `c7acf3b`, `621f487`, `f3755a0` |
| Bulk delete transactions (row selection + delete selected) | ✅ Done — `8d37fec` |
| Playwright e2e (mocked, login + transactions + shopping lists flows) | ✅ Done — `75dd6fd`, `86f6ebb`, `8ae80c3`, `3412ebb` |
| GitHub Actions CI/CD (typecheck + lint + e2e gating prod deploy) | ✅ Done — `89f3e73` |
| Staging deploy — `dev` branch → `dev.portfelik.pages.dev` | ✅ Done (2026-05-09) — verified green on push to `dev`; uses `cloudflare/wrangler-action@v3` (legacy `pages-action@v1` was Node 20 deprecated) |
| Real-DB smoke suite — runs against staging post-deploy | ✅ Done (2026-05-09) — full chain green: ci → mocked e2e → deploy-staging → smoke (real Supabase round-trip via dedicated test user, sentinel-tagged data, RLS-isolated) |
| `/admin/notifications` diagnostic page (legacy parity) | ✅ Done (2026-05-08) |
| Old infra cleanup — `tools/migrate/`, `apps/web-react/`, `functions/`, `portfelik-bff/`, `firestore.*` | ✅ Done — directories already gone; `firebase_uid` column was planned but never applied (no migration needed). Local untracked `dist/` from old React build is safe to `rm -rf`. |
| Architecture audit + docs (`docs/architecture/`) — overview, ER + DB doc, 5 flow diagrams, 10 ADRs, audit report | ✅ Done (2026-05-09) — see `docs/architecture/README.md` and `docs/architecture/audit-2026-05-09.md` |

### Phase 10 — UX refresh (2026-05-11 → 2026-05-13)

| Sub-item | Status |
|---|---|
| W1 — slate/emerald design tokens, `transition-colors` baseline in `app.css` | ✅ Done — `7b70b0f` |
| W2 — UI primitives: `Button`, `Input`, `Select`, `Badge`, `Sheet`, `Dialog`/`ConfirmDialog` migration | ✅ Done — `b480ee7`, `adc2bd3`, `16b21b9`, `c20d047`, `62f24b2` |
| W3 — `Navigation` shell + `+layout.svelte` slate tokens, mobile hamburger sheet, focus rings | ✅ Done — `885e87b` |
| W4 — page sweeps: transactions, shopping lists (+ skeleton), settings/admin/login | ✅ Done — `6b25fa7`, `ef11131`, `557dc39` |
| W5a — `/dashboard` route + root redirect, greeting, monthly summary, upcoming/overdue (max 5), mobile FAB | ✅ Done — `dd17e03` |
| W5b — `FilterDrawer` mobile Sheet w/ Apply/Clear + active-filter count badge | ✅ Done — `d2b2ad6` |
| W6a — client-side description search (`$derived` `visibleTxs`), desktop Input + mobile drawer field | ✅ Done — `9bdcc67` |
| W6b — `bulkCreateTransactions` service + batched CSV import | ✅ Done — `3478bf1` |
| W6c — `notification_type` Postgres enum + `Notification` discriminated union | ✅ Done — `6ec68aa` (migration applied to prod 2026-05-13) |

### Phase 9 — Post-audit quality items (tracked from `docs/architecture/audit-2026-05-09.md`)

| Item | Severity | Status |
|---|---|---|
| RLS regression test suite (Vitest, two JWTs) | Medium | ✅ Done 2026-05-13 — `apps/web-svelte/tests/rls/` (9 spec files, 42 tests, local Supabase) |
| Function `search_path` pinning on all SECURITY DEFINER fns (security advisor) | Medium | ✅ Already complete — all 28 SECURITY DEFINER fns pin `search_path` |
| Four FK-covering indexes + two `auth.jwt()` initPlan wraps (perf advisor) | Medium | ✅ Done 2026-05-13 — 4 FK indexes added (`20260514000000_phase9_fk_indexes.sql`); `auth.jwt()` wraps already in place (advisor false-positive on 2 nested-EXISTS forms) |
| **EMERGENCY**: `profiles.role` self-elevation via column-grant supersession (caught by P1 suite) | High | ✅ Patched 2026-05-13 — `20260514000001_phase9_lock_profile_role.sql` |
| Vault secret rotation runbook (`docs/runbooks/secret-rotation.md`) | Medium | ⏳ Backlog |
| **Offline write queue (Dexie outbox) — parity gap vs legacy `FirestoreService`** | Medium | ⏳ Backlog |
| `notifications.type` Postgres enum + `data` jsonb schema | Low | ✅ Done in Phase 10 — `6ec68aa` (enum part; `data` jsonb schema deferred — payload-by-type still untyped at DB layer) |
| Edge Function `deno.json` for each of 3 functions | Low | ✅ Done 2026-05-13 — per-function `imports` map pinning `@supabase/supabase-js`, edge runtime types, `web-push` |
| pg_cron DST documentation | Low | ✅ Done 2026-05-13 — `supabase/CLAUDE.md` "Scheduled jobs" section (lives in CLAUDE.md per rule "never amend applied migrations") |
| Migration drift — re-import early migrations into `supabase_migrations.schema_migrations` | Low | ✅ Done 2026-05-13 — declared SQL-files-as-canonical in `supabase/CLAUDE.md` "Migration tracking" section (backfill deferred; safe `supabase migration repair` instructions provided) |

**Branch flow:** `main` → prod (`portfelik.adrianzinko.com`); `dev` → staging (`dev.portfelik.pages.dev`). Same Cloudflare Pages project + same Supabase project for both — staging writes are isolated to the dedicated test user via RLS, smoke specs clean up via sentinel-tagged data.

**Staging smoke prerequisites:**
- Supabase Auth: enable `email` provider; **disable public sign-ups** (Auth → Providers → Email → "Enable signup" off). Real users continue using Google OAuth.
- Pre-create one test user via Supabase Dashboard → Authentication → Add User (email confirmed). Suggested email: `e2e-smoke@portfelik.local` (or any unused mailbox you control).
- GH Actions repo secrets: `E2E_SMOKE_EMAIL`, `E2E_SMOKE_PASSWORD`. (Existing `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` are reused.)
- Smoke test data is tagged `__e2e_smoke__` in `description`; the suite's `before/afterAll` hooks idempotently delete by that prefix.

### Push secrets — ✅ set in prod Supabase (2026-04-30)
- `INTERNAL_TRIGGER_SECRET` — set in Supabase Edge Function secrets
- `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` — set in Supabase Edge Function secrets

---

## Repository layout

```
portfelik/portfelik/
├── apps/web-svelte/        ← SvelteKit app (active — see apps/web-svelte/CLAUDE.md)
├── supabase/               ← Migrations + config (see supabase/CLAUDE.md)
├── docs/architecture/      ← Canonical architecture docs (overview, DB, flows, ADRs, audit)
├── MIGRATION_PLAN.md       ← Historical migration phase plan (now mostly complete)
└── .claude/rules/svelte-gotchas.md  ← Auto-loaded for apps/web-svelte/** work
```

---

## Infrastructure

Three-tier env. Full map: `docs/architecture/env-workflow.md`.

- **Local dev:** `pnpm dev` from `apps/web-svelte/` reads `.env.local`, which points at the **local Supabase stack** (`127.0.0.1:54321`). Boot the stack from repo root: `supabase start`. Apply migrations: `supabase db reset`. Cloud creds stashed in `apps/web-svelte/.env.cloud.local` (gitignored) for opt-in cloud debugging.
- **Staging:** `https://dev.portfelik.pages.dev` — `dev` branch deploys via GH Actions. **Still shares the prod Supabase project** (isolation is RLS-only via `E2E_SMOKE_EMAIL`). Separating staging to its own Supabase project is backlog.
- **Production:** `portfelik.adrianzinko.com` → Cloudflare Pages project `portfelik`. `main` branch deploys via GH Actions.
- **Supabase Cloud (staging + prod DB):** `https://emqzcygfwcvbmhxhfkcc.supabase.co` — publishable key from Supabase Dashboard → Settings → API.
- **Supabase MCP:** `.mcp.json` at repo root. Authenticate at session start via `mcp__supabase__authenticate`. MCP points at the cloud project; use with care.
- **Manual deploy (from `apps/web-svelte/`):**
  ```bash
  PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
  PUBLIC_SUPABASE_ANON_KEY=<key from dashboard> \
  PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4 \
  pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
  ```
