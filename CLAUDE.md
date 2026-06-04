# CLAUDE.md

## Agent Workflow Rules

Apply to every task regardless of phase.

### After every change

1. **Sanity check** - `pnpm exec svelte-check --tsconfig ./tsconfig.json` (from `apps/web-svelte/`). 0 errors, 0 warnings.
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
- Do not let `main` and `dev` independently evolve hot files (`CLAUDE.md`, shopping-list pages/components, seed scripts, Supabase docs/runbooks, E2E specs). Sync first, then edit.

---

## Project Status

**Portfelik** - personal-finance PWA. Migrating React 19 + Firebase → SvelteKit + Supabase. Full plan: `MIGRATION_PLAN.md`.
**Product doctrine:** Intent-Oriented UI lives in `docs/product/intent-oriented-ui.md`. Future workflow features should prefer deterministic engines + compact decision surfaces over CRUD-first configuration, with AI bounded to draft/explain/summarize around auditable rules.
**Immediate next step:** **Commit bank-import P0 exception-review remediation** (branch `fix/import-exception-review-p0`; one-click commit for clean statements - see remediation note below), then work the ranked P1 import items. Still pending: **commit issue #66 bank-import UX rework** (9 increments, see below) and promote the bank-import migration bundle (`202606040`–`20260607` + new `20260608000000_import_inne_fallback.sql`) to staging. Verified 2026-06-01 for issue #66: `supabase db reset` clean through `20260608`, `svelte-check` 0/0, lint 0 errors (5 existing generated Paraglide warnings), format clean, unit+RLS focused 24/24 (incl. new Inne-fallback commit test), bank-import Playwright 8/8, changed-file secret scan clean. Then resume production group-invite hotfix queue (migrations `20260531000000` + `20260601000000`, prod Vault `max_user_cap`, enable Google signups).

**Migration state (verified 2026-05-29):** local reset applies through `20260607000000_categories_own_only.sql` (drops group-shared category reads, dedupes owned rows, unique index). Prior bundle includes `202606040`–`202606060`. RLS suite 172/172 green.

Phase 12 shipped through U6 + EmptyState sweep + group hardening (2026-05-17). Highlights:

- Dark-neon UX uplift U1–U6: pill bottom nav, avatar menu, dashboard hero + sparklines + period chips, daily greeting + money quote, drill-down navigation, type filter, ConfirmDialog scale/fade, `prefers-reduced-motion` honored, EmptyState adopted across 6 screens.
- Group hardening (`20260516000000` → `20260517000003`): `transactions.group_id` opt-in with explicit assignment, both `transactions` and `shopping_lists` lock `user_id` immutable, `group_id` reassign owner-only via trigger, `disband_group` raises when group has items, INSERT policies enforce member-only group assignment.
- `attach_shopping_list_to_transaction` RPC connects an existing expense tx to a list with sharing-scope match + ≥1 item guard. The user starts that flow from the transaction detail sheet; completing a list still creates its own linked expense transaction.
- RLS regression suite 52/52 green (added 7 group/list rules + tx user_id immutability tests).
- Vitest auto-loads `.env.test` (gitignored local RLS keys) plus `.env.test.example` (non-secret defaults). Copy the example, then fill JWT keys from `supabase status -o env`.

**Completed phase history** - moved to `docs/PHASE_HISTORY.md` (master phase table, Phase 8/9/10 sub-tables, Bank CSV import V1 steps 1–5.5, shopping-list stabilization bundle). Consult it for commit hashes / dates of shipped work.

**Bank CSV import V1:** steps 1–5.5 done (see history). **Step 6** - save-as-rule + deterministic categorization rules engine shipped 2026-05-27 (branch `wip`) and rule-loop completion is local as of 2026-05-28; auto-fills `suggested_category_id`+`selected_category_id` during preview when rules/categories load, but upload falls back to manual preview rows if optional prefill fetches fail. Save-rule now defaults from a short raw merchant token, blocks duplicate/zero-match rules, applies only to uncategorized current rows, and exposes Undo that deletes the new rule plus restores changed rows. Repeated-merchant suggestions surface at 3+ rows only when a category exists to apply. Settings → Reguły shows category type and concise lower-priority shadowing hints. Duplicate warnings now cover manual/non-list transactions via Path C (`20260602000001`, exact type/amount/currency, ±1 day) and show matched transaction context. **Remaining Step 6 backlog:** masked-LLM `suggested_category` hook only (no provider wired). Dashboard AI observability ("Sygnały z okresu") parked 2026-05-24 until core product stable.

**Bank import placement issue #65:** local 2026-06-01 - transactions header no longer uses the three-dot actions menu on desktop; import/export are direct header buttons, and mobile exposes a named header `Import bankowy` control that opens the import/export sheet outside category/filter state. Transactions Playwright now covers desktop direct actions, mobile header access, category-query failure, selected-row state, and the date-range mobile test was hardened against current-month drift.

**Bank import UX rework issue #66:** local 2026-06-01 - review screen rebuilt around the intent-oriented funnel (filter → categorize → rule → group → decide). Increments: (1) `20260608000000_import_inne_fallback.sql` - `commit_import_session` assigns uncategorized import rows to the caller's own `Inne wydatki`/`Inne przychody` default (re-seeds defensively), dropping the `category_required` hard block while keeping the `rows_pending` gate; (2) save-rule now auto-matches both `match_description` + `match_counterparty` from a single derived token (no field picker); (3) per-row category `<Select>` replaced by `ImportCategoryCombobox` (search + inline create via `createCategory`), built on `SingleValueCombobox`'s new `onchange`/`oncreate` callbacks; (4) import checkbox replaced by an explicit Importuj/Pomiń `role="group"` control, `patchRow` auto-flip removed (decisions fully explicit), filter `uncategorized` dropped and `pending` ("Do decyzji") moved first; (5) ~~required rule capture per merchant/content group via `ensureRulesThenImport`~~ **never landed in code** (corrected 2026-06-04): commit gates only on zero-pending + >=1-import, and `captureRuleForRow` silently learns a rule when the user picks a category - there is no merchant-group rule-gate; (6) sticky decision surface (suggestions + filter chips) on desktop+mobile, non-sticky thead; (7) `beforeNavigate` leave guard with Save/Discard (`fetchActivePreviewSession` + `cancelImportSession` soft-cancel) and a resume card on the upload step; (8) confirmation screen lists rows going to "Inne" + a skipped section; (9) "Pomiń widoczne" bulk action over the filtered view. Sessions are soft-cancelled (FK `on delete restrict` + no delete RLS), so "discard" sets status `cancelled`, never deletes.

**Bank import P0 exception-review remediation (issue #66 follow-up, 2026-06-04, branch `fix/import-exception-review-p0`):** the review is now a true exception-review surface. Removed the `queueInitialized` blanket flip in `ImportReviewFlow.svelte` that turned every default-import row into `pending` - it fought the issue #73 default-import model and forced a per-row decision on clean statements. Rows now stay as the deterministic engine decides them (`import`/`duplicate`); a fully auto-categorized statement is one-click committable; uncategorized rows stay `import` and flow to `Inne` via the confirm sheet; `pending` ("Do decyzji") is reserved for rows the user explicitly defers (skip / duplicate-restore). Default selected filter is now `all`, leading with `pending` only when rows await a decision (no empty first screen). E2E mock now faithfully inserts `decision:"import"` (matching `bank-import.ts:302`); +1 bulk-action test; bank-import Playwright 14/14. svelte-check 0/0, lint 0 errors (5 pre-existing Paraglide warnings), format clean, changed-file secret scan clean. P1-3 (editable description on mobile + ungated from counterparty) and P1-6 (decision controls: 44px mobile touch target, desktop text labels, focus-visible ring; `aria-label` retained for icon-only mobile) landed 2026-06-04. P1-5 verified via live EXPLAIN: Path A uses `transaction_import_links_fingerprint_idx (user_id, fingerprint)`, Path C uses the dedicated `idx_transactions_manual_duplicate_scan_user (user_id, type, amount, currency)` anti-join - dedup scans are well-indexed, no schema change; only the minor `OR is_group_member()` arm can't use the composite index (negligible at personal-finance scale - revisit only if a heavy group-shared history shows slow preview/commit). Remaining: P1-4 row virtualization (dedicated swing) + P2 test/polish.

**Open backlog:**

- Vault secret rotation runbook (`docs/runbooks/secret-rotation.md`) - Medium, ⏳.
- Offline write queue (Dexie outbox) - parity gap vs legacy `FirestoreService`, last-write-wins decided - Medium, ⏳.
- axe-core a11y sweep (deferred U7).
- Virtualized/infinite scroll for long lists - transactions table + bank-import review render every row; add windowing once dataset warrants (noted 2026-05-26).
- Mortgage/debt tracking - follow-on track.

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
├── docs/architecture/      ← Canonical architecture docs (overview, DB, flows, ADRs, audit)
├── MIGRATION_PLAN.md       ← Historical migration phase plan (now mostly complete)
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
