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

**Immediate next step:** Phase 8 remainder — wire staging deploy, add real-DB smoke suite, port `/admin/notifications`, execute old-infra cleanup.

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
| 8 — Hardening — see sub-table | 🟡 In progress (2026-05-08) |

### Phase 8 — Hardening (deferred UX + quality)

| Sub-item | Status |
|---|---|
| Dark mode (`dark:` variants + `prefers-color-scheme`) | ✅ Done — `87121e2`, `c7acf3b`, `621f487`, `f3755a0` |
| Bulk delete transactions (row selection + delete selected) | ✅ Done — `8d37fec` |
| Playwright e2e (mocked, login + transactions + shopping lists flows) | ✅ Done — `75dd6fd`, `86f6ebb`, `8ae80c3`, `3412ebb` |
| GitHub Actions CI/CD (typecheck + lint + e2e gating prod deploy) | ✅ Done — `89f3e73` |
| Staging deploy — `dev` branch → `dev.portfelik.pages.dev` | 🟡 Workflow ready (2026-05-08); needs first push to `dev` to verify |
| Real-DB smoke suite — runs against staging post-deploy | 🟡 Specs + workflow ready (2026-05-08); blocked on Supabase Auth email-provider toggle + GH secrets `E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD` |
| `/admin/notifications` diagnostic page (legacy parity) | ✅ Done (2026-05-08) |
| Old infra cleanup — `tools/migrate/`, `apps/web-react/`, `functions/`, `portfelik-bff/`, `firestore.*` | ✅ Done — directories already gone; `firebase_uid` column was planned but never applied (no migration needed). Local untracked `dist/` from old React build is safe to `rm -rf`. |

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
├── MIGRATION_PLAN.md       ← Authoritative phase plan — read before each phase
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
