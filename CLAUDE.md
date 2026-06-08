# CLAUDE.md

## Agent Workflow Rules

Apply to every task regardless of phase.

### After every change

1. **Sanity check** - `pnpm exec svelte-check --tsconfig ./tsconfig.json` (from `apps/web-svelte/`). 0 errors, 0 warnings.
   **E2E (optional pre-PR)** - `pnpm test:e2e` from `apps/web-svelte/` (Chromium via `postinstall`; `pnpm test:e2e:install` if missing).
2. **Lint** - `pnpm lint` (from `apps/web-svelte/`). 0 errors.
3. **Format** - `pnpm format:check`; if fails run `pnpm format` then re-check.
4. **Security** - `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>`. Flag anything before proceeding. Real cloud creds belong in `apps/web-svelte/.env.cloud.local` (gitignored). Local RLS JWTs belong in `apps/web-svelte/.env.test` (gitignored), never in `.env.test.example`.
5. **Schema validation** - new tables: RLS enabled? Migrations: idempotent naming?

### Before finalising

6. **Paraglide recompile** if `messages/pl.json` touched: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` (from `apps/web-svelte/`).
7. **Commit list** - MANDATORY after every increment. Output:
   - (a) Ordered list of Conventional Commit messages (feat/fix/chore/refactor + scope + body explaining WHY)
   - (b) Exact file list per commit
   - User commits manually. Do not skip this step even if changes seem minor.

### After each increment

8. **Update CLAUDE.md** phase table + "Immediate next step". Update `~/.claude/projects/.../memory/project_state.md`. Stale docs are worse than none.
9. **Handoff notes** - next agent must cold-start from CLAUDE.md alone.

### Increment discipline

- Split by concern: schema / services / components / config. One migration per logical schema change. Never amend applied migrations.

### Tooling and context discipline

- **Edgar worker:** use `/Users/adrianzinko/.local/bin/edgar` for broad file reading, 3+ files, files over ~400 lines, broad search, and structural summaries. Prefer `edgar --paths <paths...> --question "<specific question>"`. Use `edgar-parse --kind <jest|vitest|ts|eslint|pytest|cargo|generic>` for noisy test/lint/compiler output and `edgar-diff` for large diffs. Treat Edgar output as context, not ground truth; verify important claims against source before editing.
- **RTK:** `rtk` is installed at `/opt/homebrew/bin/rtk` and may be used for token-filtered shell output. Use `rtk gain`, `rtk gain --history`, and `rtk discover` directly for analytics. For ordinary shell work, hooks may rewrite commands automatically in Claude; Codex/Cursor agents should prefer the same small-output discipline manually.
- **Large file rule:** do not raw-read large files unless exact lines are needed. Summarize with Edgar first, then inspect precise source ranges directly.
- **Svelte scoped gotchas:** before work under `apps/web-svelte/**`, read `.claude/rules/svelte-gotchas.md` or the equivalent Cursor rule. Keep this context path-scoped instead of bloating root guidance.
- **Plugin parity:** Claude-only plugins (`frontend-design`, `superpowers`, `caveman`) are not portable config. Mirror their durable behavior instead: use frontend verification for UI work, brainstorm before ambiguous multi-step work, use TDD where risk warrants it, and keep user-facing prose concise.
- **Skills over commands:** reusable workflows live in `.agents/skills/**/SKILL.md` and mirrored `.claude/skills/**/SKILL.md` only where Claude compatibility needs it. Do not recreate deprecated slash-command or prompt files.

### Multi-agent workflow

- Use the main agent for final decisions, edits, git hygiene, and user communication.
- Use repo-scoped skills for repeatable workflows that do not need isolated context: `/pr`, `/issues`, deployment, and the `agent-workflow` playbook.
- Use subagents only for bounded side work that would otherwise pollute context or benefits from independent verification: codebase exploration, quality review, frontend verification, and Supabase/RLS review.
- Give each subagent a narrow task, exact files or paths when possible, and an expected output shape with file references. The parent agent must verify important claims before editing or finalizing.
- For complex work, run independent exploration/review/database/frontend checks in parallel, then synthesize the result into one implementation plan. Avoid recursive delegation unless explicitly needed.
- After implementation, run the smallest relevant gates first, parse noisy output with `edgar-parse`, then run the required project gates before PR creation.

### Branch sync discipline

- `main` is production truth. `dev` is staging/integration and must not drift as an independent source of truth.
- Before starting work on `dev`: `git fetch origin`, ensure the worktree is clean, then merge `origin/main` into `dev` and resolve conflicts immediately.
- After anything lands on `main`: immediately sync `dev` from `origin/main`, run the relevant gates, and push `dev`.
- Feature branches start from current `dev`; before pushing a feature branch, merge the latest `origin/dev` and re-run relevant gates.
- Before production promotion: sync `dev` from `origin/main`, verify, then PR/merge `dev` into `main`; after the merge, sync `dev` from `origin/main` again.
- Do not let `main` and `dev` independently evolve hot files (`CLAUDE.md`, plan/list pages/components, seed scripts, Supabase docs/runbooks, E2E specs). Sync first, then edit.

---

## Project Status

**Portfelik** - import-first personal-finance PWA on SvelteKit + Supabase.
Current product direction lives in `docs/product/product-direction.md`; UI
doctrine lives in `docs/product/intent-oriented-ui.md`.

**Product spine:** Pulpit, Transakcje, Import, Plany, Ustawienia. Import is the
preferred source of real transaction data. Manual transactions stay as
fallback/corrections. Plans express future intent and should be settled by
linking to existing transactions, not by creating financial truth by default.
Groups/invites are a core collaboration layer for couples, friends, and trusted
small groups. Directionally, group membership should be role-based: owners
manage lifecycle/invites, nominated co-owners can manage group-scoped
transactions/plans, and regular members participate without broad admin rights.
All of this must preserve private/group scope and owner-only import provenance.

**Current implementation note:** Plans now use first-class `plans` storage with
required `start_date` / `end_date`, optional `budget_amount`, and
`plan_transaction_links` settlement. Legacy shopping-list storage, checklist
items, and list-completion RPCs are retired in the first-class Plans cut.

**Bank import direction:** review should be an exception surface. Clean rows
import by default, duplicates are folded, uncategorized rows go through the
visible `Inne` confirmation path, and `pending` should be reserved for genuine
risk or explicit deferment. No shipped forced rule-capture gate exists; rule
capture is a convenience around category choices.

**Alerts direction:** alerts should reinforce the core product loop, not become
a generic task system. Import reminders are the first alert: opt-in profile
setting, 7/14/30-day cadence, based on committed import sessions, delivered via
the in-app notification row with push as an optional channel.

**Bank import (shipped 2026-06):** exception-review surface, adapter registry, review virtualization, 19 Playwright cases, service/component tests. Clean rows commit by default; `pending` only on explicit defer; `Inne` for uncategorized.

**Public launch program (2026-06):** MVP+ **landed on `main`** (2026-06-07, #104 + readiness stack through `41717c7`). Shopping lists → Plany migration closed ([#103](https://github.com/adrianghub/portfelik/issues/103)). Phases 0–5 complete per `docs/product/mvp-hardening.md`.

**Goals & Debt v1.5 polish (2026-06-07):** debt timeline, Belka scenarios, save sliders, balance sync from raty.

**Net worth D2 (2026-06-07):** surplus card on `/plans`, Pulpit net-worth strip; nadwyżka formula in `debt-and-savings-goals.md`.

**Group plans G2 (2026-06-07):** co-owner-only plan/debt-term writes; member read + settle unchanged.

**Trust hardening (2026-06-08):** ledger vs forecast cashflow, plan settlement policy, shared-tx write UI gates ([#111](https://github.com/adrianghub/portfelik/pull/111) / [#112](https://github.com/adrianghub/portfelik/pull/112) on `main`).

**Launch certification (2026-06-08):** gates green; manual prod/staging verification done; **feature freeze** until post-launch issues opened.

**Immediate next step:** monitor prod/staging; complete optional advisor dashboard toggles (leaked-password on prod+staging); invite beta couples only after group-role E2E + RLS trust tests land.

**Open backlog:**

- Vault secret rotation runbook (`docs/runbooks/secret-rotation.md`) - authored ✅; ops-lockdown runbook (`docs/runbooks/ops-access-lockdown.md`) - authored ✅; Layer 2 audit stamped 2026-06-08 ✅.
- Offline write queue (Dexie outbox) - parity gap vs legacy `FirestoreService`, last-write-wins decided - Medium, ⏳.
- axe-core spine sweep shipped (`e2e/tests/a11y-spine.spec.ts`); broader U7 sweep still optional.
- Mortgage/debt tracking - **save/debt plan kinds + manual net-worth snapshot shipped**; auto net worth from import still deferred.
- Prod Supabase advisors: leaked-password protection (dashboard toggle, prod+staging) - ⏳ operator; `pg_net` schema migration + extensions-in-public CI gate - ✅ (`20260625`, `scripts/check-security-advisors.sh`).

**Branch flow:** `main` → prod (`portfelik.adrianzinko.com`); `dev` → staging (`dev.portfelik.pages.dev`). Both branches use one Cloudflare Pages project. Supabase is split: `main` uses production; `dev` must use the dedicated `portfelik-staging` project.

**Staging smoke prerequisites:**

- Supabase Auth on `portfelik-staging`: enable Google OAuth for manual verification and email/password for automation personas; **disable public sign-ups**.
- Staging smoke + demo users are ensured by `pnpm seed:staging` from CI using synthetic-only credentials. The same step also creates manual test personas `admin@portfelik.test` and `user@portfelik.test` with password equal to login; override with `STAGING_ADMIN_*` / `STAGING_USER_*` only if needed.
- GH Actions Staging secrets: `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`, `STAGING_SUPABASE_PROJECT_REF`, `STAGING_PUBLIC_SUPABASE_URL`, `STAGING_PUBLIC_SUPABASE_ANON_KEY`, `STAGING_PUBLIC_VAPID_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_E2E_SMOKE_EMAIL`, `STAGING_E2E_SMOKE_PASSWORD`, `STAGING_DEMO_EMAIL`, `STAGING_DEMO_PASSWORD`.
- Smoke test data is tagged `__e2e_smoke__` in `description`; the suite's `before/afterAll` hooks idempotently delete by that prefix.

### Push secrets - ✅ set in prod Supabase (2026-04-30)

- `INTERNAL_TRIGGER_SECRET` - set in Supabase Edge Function secrets
- `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` - set in Supabase Edge Function secrets

---

## Repository layout

```
portfelik/portfelik/
├── apps/web-svelte/        ← SvelteKit app (active - see apps/web-svelte/CLAUDE.md)
├── supabase/               ← Migrations + config (see supabase/CLAUDE.md)
├── docs/product/           ← Product direction + intent-oriented UI doctrine
├── docs/architecture/      ← Canonical architecture docs (overview, DB, flows, ADRs)
├── docs/runbooks/          ← Operational runbooks
└── .claude/rules/svelte-gotchas.md  ← Auto-loaded for apps/web-svelte/** work
```

---

## Infrastructure

Three-tier env. Full map: `docs/architecture/env-workflow.md`.

- **Local dev:** `pnpm dev` from `apps/web-svelte/` reads `.env.local`, which points at the **local Supabase stack** (`127.0.0.1:54321`). Boot the stack from repo root: `supabase start`. Apply migrations: `supabase db reset`, then seed personas with `pnpm seed:local` from `apps/web-svelte/` or `./scripts/supabase-ops.sh local seed`. Cloud creds stashed in `apps/web-svelte/.env.cloud.local` (gitignored) for opt-in cloud debugging.
- **Staging:** `https://dev.portfelik.pages.dev` - `dev` branch deploys via GH Actions after `migrate-staging` applies committed migrations, system seed, Edge Functions, and synthetic personas to `portfelik-staging`.
- **Production:** `portfelik.adrianzinko.com` → Cloudflare Pages project `portfelik`. `main` branch deploys via GH Actions.
- **Supabase Cloud (prod):** `https://emqzcygfwcvbmhxhfkcc.supabase.co` - publishable key from Supabase Dashboard → Settings → API.
- **Supabase Cloud (staging):** dedicated `portfelik-staging` project. Keep its project ref, anon key, service-role key, DB password, and access token in Staging secrets only.
- **Supabase MCP:** `.mcp.json` at repo root. Use explicit servers: `supabase-prod` for production, `supabase-account` only for project/account work, and add `supabase-staging` after the staging ref exists.
- **Manual deploy (from `apps/web-svelte/`):**
  ```bash
  PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
  PUBLIC_SUPABASE_ANON_KEY=<key from dashboard> \
  PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4 \
  pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
  ```
