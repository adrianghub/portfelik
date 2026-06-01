# CLAUDE.md

## Agent Workflow Rules

Apply to every task regardless of phase.

### After every change

1. **Sanity check** — `pnpm exec svelte-check --tsconfig ./tsconfig.json` (from `apps/web-svelte/`). 0 errors, 0 warnings.
2. **Lint** — `pnpm lint` (from `apps/web-svelte/`). 0 errors.
3. **Format** — `pnpm format:check`; if fails run `pnpm format` then re-check.
4. **Security** — `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>`. Flag anything before proceeding. Real cloud creds belong in `apps/web-svelte/.env.cloud.local` (gitignored). Local RLS JWTs belong in `apps/web-svelte/.env.test` (gitignored), never in `.env.test.example`.
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

### Branch sync discipline

- `main` is production truth. `dev` is staging/integration and must not drift as an independent source of truth.
- Before starting work on `dev`: `git fetch origin`, ensure the worktree is clean, then merge `origin/main` into `dev` and resolve conflicts immediately.
- After anything lands on `main`: immediately sync `dev` from `origin/main`, run the relevant gates, and push `dev`.
- Feature branches start from current `dev`; before pushing a feature branch, merge the latest `origin/dev` and re-run relevant gates.
- Before production promotion: sync `dev` from `origin/main`, verify, then PR/merge `dev` into `main`; after the merge, sync `dev` from `origin/main` again.
- Do not let `main` and `dev` independently evolve hot files (`CLAUDE.md`, shopping-list pages/components, seed scripts, Supabase docs/runbooks, E2E specs). Sync first, then edit.

---

## Project Status

**Portfelik** — personal-finance PWA. Migrating React 19 + Firebase → SvelteKit + Supabase. Full plan: `MIGRATION_PLAN.md`.
**Product doctrine:** Intent-Oriented UI lives in `docs/product/intent-oriented-ui.md`. Future workflow features should prefer deterministic engines + compact decision surfaces over CRUD-first configuration, with AI bounded to draft/explain/summarize around auditable rules.
**Immediate next step:** **Commit issue #65 bank-import placement polish** with the MVP hardening final polish, then promote migration `20260607000000_categories_own_only.sql` with the existing `202606040`–`202606060` bundle to staging. Verified 2026-06-01 for issue #65: `svelte-check` 0/0, lint 0 errors (5 existing generated Paraglide warnings), format clean, focused transactions Playwright 14/14, app changed-file secret scan clean. Then resume production group-invite hotfix queue (migrations `20260531000000` + `20260601000000`, prod Vault `max_user_cap`, enable Google signups).

**Migration state (verified 2026-05-29):** local reset applies through `20260607000000_categories_own_only.sql` (drops group-shared category reads, dedupes owned rows, unique index). Prior bundle includes `202606040`–`202606060`. RLS suite 172/172 green.

Phase 12 shipped through U6 + EmptyState sweep + group hardening (2026-05-17). Highlights:

- Dark-neon UX uplift U1–U6: pill bottom nav, avatar menu, dashboard hero + sparklines + period chips, daily greeting + money quote, drill-down navigation, type filter, ConfirmDialog scale/fade, `prefers-reduced-motion` honored, EmptyState adopted across 6 screens.
- Group hardening (`20260516000000` → `20260517000003`): `transactions.group_id` opt-in with explicit assignment, both `transactions` and `shopping_lists` lock `user_id` immutable, `group_id` reassign owner-only via trigger, `disband_group` raises when group has items, INSERT policies enforce member-only group assignment.
- `attach_shopping_list_to_transaction` RPC connects an existing expense tx to a list with sharing-scope match + ≥1 item guard. The user starts that flow from the transaction detail sheet; completing a list still creates its own linked expense transaction.
- RLS regression suite 52/52 green (added 7 group/list rules + tx user_id immutability tests).
- Vitest auto-loads `.env.test` (gitignored local RLS keys) plus `.env.test.example` (non-secret defaults). Copy the example, then fill JWT keys from `supabase status -o env`.

**Completed phase history** — moved to `docs/PHASE_HISTORY.md` (master phase table, Phase 8/9/10 sub-tables, Bank CSV import V1 steps 1–5.5, shopping-list stabilization bundle). Consult it for commit hashes / dates of shipped work.

**Bank CSV import V1:** steps 1–5.5 done (see history). **Step 6** — save-as-rule + deterministic categorization rules engine shipped 2026-05-27 (branch `wip`) and rule-loop completion is local as of 2026-05-28; auto-fills `suggested_category_id`+`selected_category_id` during preview when rules/categories load, but upload falls back to manual preview rows if optional prefill fetches fail. Save-rule now defaults from a short raw merchant token, blocks duplicate/zero-match rules, applies only to uncategorized current rows, and exposes Undo that deletes the new rule plus restores changed rows. Repeated-merchant suggestions surface at 3+ rows only when a category exists to apply. Settings → Reguły shows category type and concise lower-priority shadowing hints. Duplicate warnings now cover manual/non-list transactions via Path C (`20260602000001`, exact type/amount/currency, ±1 day) and show matched transaction context. **Remaining Step 6 backlog:** masked-LLM `suggested_category` hook only (no provider wired). Dashboard AI observability ("Sygnały z okresu") parked 2026-05-24 until core product stable.

**Bank import placement issue #65:** local 2026-06-01 — transactions header no longer uses the three-dot actions menu on desktop; import/export are direct header buttons, and mobile exposes a named header `Import bankowy` control that opens the import/export sheet outside category/filter state. Transactions Playwright now covers desktop direct actions, mobile header access, category-query failure, selected-row state, and the date-range mobile test was hardened against current-month drift.

**Open backlog:**

- Vault secret rotation runbook (`docs/runbooks/secret-rotation.md`) — Medium, ⏳.
- Offline write queue (Dexie outbox) — parity gap vs legacy `FirestoreService`, last-write-wins decided — Medium, ⏳.
- axe-core a11y sweep (deferred U7).
- Virtualized/infinite scroll for long lists — transactions table + bank-import review render every row; add windowing once dataset warrants (noted 2026-05-26).
- Mortgage/debt tracking — follow-on track.

**Branch flow:** `main` → prod (`portfelik.adrianzinko.com`); `dev` → staging (`dev.portfelik.pages.dev`). Both branches use one Cloudflare Pages project. Supabase is split: `main` uses production; `dev` must use the dedicated `portfelik-staging` project.

**Staging smoke prerequisites:**

- Supabase Auth on `portfelik-staging`: enable Google OAuth for manual verification and email/password for automation personas; **disable public sign-ups**.
- Staging smoke + demo users are ensured by `pnpm seed:staging` from CI using synthetic-only credentials. The same step also creates manual test personas `admin@portfelik.test` and `user@portfelik.test` with password equal to login; override with `STAGING_ADMIN_*` / `STAGING_USER_*` only if needed.
- GH Actions Staging secrets: `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`, `STAGING_SUPABASE_PROJECT_REF`, `STAGING_PUBLIC_SUPABASE_URL`, `STAGING_PUBLIC_SUPABASE_ANON_KEY`, `STAGING_PUBLIC_VAPID_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_E2E_SMOKE_EMAIL`, `STAGING_E2E_SMOKE_PASSWORD`, `STAGING_DEMO_EMAIL`, `STAGING_DEMO_PASSWORD`.
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

- **Local dev:** `pnpm dev` from `apps/web-svelte/` reads `.env.local`, which points at the **local Supabase stack** (`127.0.0.1:54321`). Boot the stack from repo root: `supabase start`. Apply migrations: `supabase db reset`, then seed personas with `pnpm seed:local` from `apps/web-svelte/` or `./scripts/supabase-ops.sh local seed`. Cloud creds stashed in `apps/web-svelte/.env.cloud.local` (gitignored) for opt-in cloud debugging.
- **Staging:** `https://dev.portfelik.pages.dev` — `dev` branch deploys via GH Actions after `migrate-staging` applies committed migrations, system seed, Edge Functions, and synthetic personas to `portfelik-staging`.
- **Production:** `portfelik.adrianzinko.com` → Cloudflare Pages project `portfelik`. `main` branch deploys via GH Actions.
- **Supabase Cloud (prod):** `https://emqzcygfwcvbmhxhfkcc.supabase.co` — publishable key from Supabase Dashboard → Settings → API.
- **Supabase Cloud (staging):** dedicated `portfelik-staging` project. Keep its project ref, anon key, service-role key, DB password, and access token in Staging secrets only.
- **Supabase MCP:** `.mcp.json` at repo root. Use explicit servers: `supabase-prod` for production, `supabase-account` only for project/account work, and add `supabase-staging` after the staging ref exists.
- **Manual deploy (from `apps/web-svelte/`):**
  ```bash
  PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
  PUBLIC_SUPABASE_ANON_KEY=<key from dashboard> \
  PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4 \
  pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
  ```
