# CLAUDE.md

## Agent Workflow Rules

Apply to every task regardless of phase.

### After every change
1. **Sanity check** — `pnpm exec svelte-check --tsconfig ./tsconfig.json` (from `apps/web-svelte/`). 0 errors, 0 warnings.
2. **Lint** — `pnpm lint` (from `apps/web-svelte/`). 0 errors.
3. **Format** — `pnpm format:check`; if fails run `pnpm format` then re-check.
4. **Security** — `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>`. Flag anything before proceeding.
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

**Immediate next step:** Phase 11 UX polish shipped 2026-05-13 (optimistic shopping mutations + sticky FAB + ProgressRing on cards + dashboard "wins this month" widget + completion confetti + greeting/title typography bump). Remaining backlog: vault rotation runbook (`docs/runbooks/secret-rotation.md`) and **Dexie offline outbox** (legacy parity gap, last-write-wins decided).

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
| 11 — UX polish (optimistic shopping mutations, sticky FAB, ProgressRing, dashboard wins widget, completion confetti, typography bump) | ✅ Done (2026-05-13) |

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

- **Supabase Cloud:** `https://emqzcygfwcvbmhxhfkcc.supabase.co` — publishable key from Supabase Dashboard → Settings → API.
- **Supabase MCP:** `.mcp.json` at repo root. Authenticate at session start via `mcp__supabase__authenticate`.
- **Production:** `portfelik.adrianzinko.com` → Cloudflare Pages project `portfelik`. GitHub Actions deploys on push to `main`.
- **Staging:** `https://dev.portfelik.pages.dev`
- **Deploy (from `apps/web-svelte/`):**
  ```bash
  PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
  PUBLIC_SUPABASE_ANON_KEY=<key from dashboard> \
  PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4 \
  pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
  ```
