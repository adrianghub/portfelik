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

**Immediate next step:** Phase 5.6 CSV import/export. Then 5.7 (delete `portfelik-bff/`). Then Firebase decommission (Phase 7).

| Phase | Status |
|---|---|
| 0–4 | ✅ Done |
| 5.1–5.5 — mutations, Edge Fns, push | ✅ Done + deployed to prod |
| Gap fixes (2026-04-29) — shared tx badge, clickable category breakdown, admin role toggle+search, in-app notifications bell | ✅ Done |
| Gap fixes (2026-04-29) — multi-month date range filter, tx detail sheet on row click, shopping list item suggestions | ✅ Done |
| 5.6 — CSV import/export | ⬜ **Next** |
| 5.7 — Retire `portfelik-bff/` | ⬜ Not started |
| 7 — Cutover | 🟡 Live in prod. Firebase decommission pending. |
| 8 — Hardening + Playwright | ⬜ Not started |

### Phase 5.6 — CSV import/export
- **Export**: query via PostgREST → format CSV in browser → `URL.createObjectURL` download. No server needed (`adapter-static`).
- **Import**: file input → parse CSV in browser → validate → batch insert via `services/transactions.ts`. Match categories by name (case-insensitive). Report unknown categories.
- Check `src/modules/transactions/` in the React app for existing export field names before designing the CSV schema.

### Pending before push works end-to-end
1. **INTERNAL_TRIGGER_SECRET**: `openssl rand -hex 32` → Edge Function secret + `select vault.create_secret('<hex>', 'internal_trigger_secret');`
2. **VAPID secrets**: Edge Function → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:zinko.adrian00@gmail.com`

---

## Repository layout

```
portfelik/portfelik/
├── apps/web-svelte/        ← SvelteKit app (active — see apps/web-svelte/CLAUDE.md)
├── src/                    ← React 19 app (LEGACY — frozen, read-only reference)
├── functions/src/          ← Firebase Cloud Functions (reference only, replaced by Edge Fns)
├── portfelik-bff/          ← Go BFF (RETIRING in 5.7)
├── supabase/               ← Migrations + config (see supabase/CLAUDE.md)
├── MIGRATION_PLAN.md       ← Authoritative phase plan — read before each phase
└── .claude/rules/svelte-gotchas.md  ← Auto-loaded for apps/web-svelte/** work
```

> Do not add features to `src/` (React). It is frozen.

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
