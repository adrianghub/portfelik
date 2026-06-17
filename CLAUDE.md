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

**Product spine:** Pulpit, Transakcje, Import, Plany, Ustawienia. Main nav
intentionally shows only Pulpit / Transakcje / Plany (+ Ustawienia in the
avatar menu); Import is a flow, not a nav destination — entered from the
Transakcje header, the Pulpit import-health card, and import reminders.
Import is the preferred source of real transaction data. Manual transactions stay as
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

**Plans consistency pass (2026-06-10, local):** canonical `debtDisplayBalance` + `estimateInterestAccruedSince` (detail, net worth, PlanCard, scenarios now agree), kind-aware `DashboardPlanProgress`, surplus debt-coverage gating (`gateObservedDebtCoverage`), SW focused-client suppression, quick-settle plan-progress invalidation, numeric inputs beside sliders, persistent settle dismissals (`plan_settlement_dismissals` table + RLS, migration `20260701000000`), suggestion scoring rebalance (income amount bonus on save plans + 30-day recency) with a hard <45% cutoff and empty-state hint. Gates: svelte-check 0/0, lint 0, format clean, unit 173/173, RLS 256/256, plan-settle E2E 6/6, secret scan clean. Awaiting manual commits.

**Launch certification (2026-06-08):** gates green; manual prod/staging verification done; **feature freeze** until post-launch issues opened.

**Recurring + debt-banner trust fix (2026-06-11, local):** recurring templates are now reminder-only — migration `20260703000000` rewrites `process_recurring_transactions` to send `transaction_reminder` notifications (next occurrence ≤ tomorrow, deduped per template+date) and never insert transaction rows (root cause of the phantom same-day rata + overdue alert). Debt detect banner confirm performs a real settlement link + balance sync; detection excludes already-linked txs and suggests the newest occurrence (pure `groupDebtPaymentCandidates` core + unit tests). Vestigial `plan_debt_terms.anchor_transaction_id`/`payment_day` dropped (migration `20260704000000`). Gates: db reset + function smoke, svelte-check 0/0, lint 0, format clean, unit 191/191, RLS 256/256, plans+plan-settle E2E 12/12, secret scan clean. Awaiting manual commits.

**Product review 2026-06-11:** `docs/PRODUCT_REVIEW_2026-06-11.md` — overall 8/10; safe for invited testers after beta gates close. Alignment pass done same day (local): prod deploy workflow gained env guard + read-only post-deploy probe, delete-plan now invalidates progress/debt-terms caches, PlanCard + net-worth surfaces consume real linked payments (`PlanSettlementProgress.linkedExpenses`) instead of the stored-balance heuristic, orphaned `transactions.recurring_template_id` dropped (migration `20260705000000`), architecture docs (database.md, recurring flow, supabase/CLAUDE.md) refreshed. Same pass fixed the "zapłacone odsetki" regression: old estimate (current balance × days) shrank whenever a payment lowered the balance; new `estimateInterestPaidSince` (debt-balance-replay.ts) is piecewise — frozen pre-anchor average-balance segment + actual post-anchor flat accrual — so paid interest is monotonic.

**Founder gap pass (2026-06-12, committed on `dev`):** (1) **Push root cause:** prod build's GH secret `PUBLIC_VAPID_KEY` drifted from the Supabase VAPID pair → every web push rejected (pg_net responses showed `sent:0`); canonical public key now pinned in `deploy-production.yml`, `send-push` logs per-endpoint failures and prunes 401/403 (VAPID-mismatch) subs, client `doSubscribe` auto-resubscribes when the existing subscription's `applicationServerKey` differs. **Push fix reaches users only after a prod deploy + each device re-opens the app.** (2) **Surplus deposit crediting:** `computeMonthlySurplus` gains `saveContributionsThisMonth` (from new `PlanSettlementProgress.linkedIncomeCurrentMonth`); `afterSaveGoals` subtracts only the unmet pace, planning-queue chip asks for the remaining amount, headline negative copy reframed ("Do pokrycia celów brakuje X"). (3) **Import review:** removed stale `$effect` that reset income/expense filter pills whenever pending=0 (the "dead filter buttons" bug), review-level undo stack ("Cofnij ostatnią zmianę"), confirm-sheet "Pomiń bez kategorii (N)" escape hatch, rule row-inspection chip (toast "Pokaż wiersze" + rule editor button). (4) **Cadence nudge:** review shows an informational banner when the statement spans more days than the user's import-reminder cadence (`statementSpanDays`, default 14) — soft nudge, never a hard cap (backfill stays possible). Gates: svelte-check 0/0, lint 0, format clean, unit 200/200, bank-import E2E 22/22, secret scan clean.

**Immediate next step (2026-06-13):** beta-gate closure — gates 1 & 2 **DONE**, gate 3 + invite remain. (1) ✅ trust fix + alignment pass landed on `main` via #142; migrations `20260703`–`20260705` verified applied to prod Supabase (`list_migrations`). dev fast-forwarded to `04a608b` and pushed (branches synced 0/0). (2) ✅ `seed-personas.mjs` verified idempotent (`cleanupDemoRows`→`seedDemoRows` per persona, `DEMO_PREFIX`-keyed, `group_members` via `user_groups` FK cascade); staging audit found prefixed demo data clean (txs 60/60, plans 9/9, cats 12/12, 0 dups) — the "3×" was the 3 demo personas, not a bug; one stray exact-dup tx (import double-commit under `demo@portfelik.dev`) deleted, staging now 0 exact-dup transactions. (3) **DEFERRED (2026-06-13):** leaked-password protection is a **paid** Supabase tier feature — descoped for beta, not a blocker; revisit if/when on a paid plan. Prod advisor will keep WARN `auth_leaked_password_protection` until then (expected). **Phase 0 closed** → invite first test couple (50/50 single/couple cohort per `docs/NEXT_STEPS_BRAINSTORM` Phase 0). Pre-invite must-have: stand up beta instrumentation (Phase 1) so meters run on day one. Remaining review backlog: `/plans` zero-state dedupe, detect-banner E2E case, terms-edit cancel + input disabling, PlanForm extraction, Dashboard error state.

**Debt-engine simplification + refinance (2026-06-17, local on `feat/debt-engine-simplification`):** debt live balance is now a single pure scheduled-amortization engine (`services/debt-schedule.ts`): `buildSchedule`/`scheduleBalanceAt`/`liveBalance` step the balance monthly (odd first-period gap interest, neg-amort guard) and re-anchor only on real linked payments — **no daily ticking**, no first-principles daily compounding. `debt-balance-replay.ts` deleted; `plan-debt.ts` delegates to the engine; 7 caller surfaces (net worth, PlanCard, DashboardPlanProgress, detail/scenarios/settle pages, DebtPlanDetail) repointed. New optional terms `first_payment_date` / `first_payment_amount` (migration `20260710000000`, backfills date = `plans.start_date`) model odd/larger opening installments off the loan agreement. **Refinance** is a no-money flow (migration `20260711000000` adds `plans.status` active|refinanced|closed + `refinanced_from_plan_id` / `replaced_by_plan_id`): `services/plan-refinance.ts` `refinanceDebtPlan` inserts the new debt plan + terms, archives the old plan (status=refinanced, links the replacement), rolls back the new plan on failure (terms cascade via FK), and writes **zero transactions** (cash wash nets to zero). UI: first-payment fields in the debt create/edit form; a "Refinansuj kredyt" accordion + lineage badges in `DebtPlanDetail`. Gates: svelte-check 0/0, lint 0 err (5 pre-existing generated-paraglide warnings), format clean, unit 217/217, RLS 266/266, E2E plans+settle 13/13 (incl. new refinance case asserting no tx POST), extension-in-public advisor OK, secret scan clean. Migrations applied locally via `db reset`; backfill verified (`first_payment_date` = start_date). **Not yet on prod/staging; awaiting PR + the two migrations applied to prod Supabase.**

**Open backlog:**

- Vault secret rotation runbook (`docs/runbooks/secret-rotation.md`) - authored ✅; ops-lockdown runbook (`docs/runbooks/ops-access-lockdown.md`) - authored ✅; Layer 2 audit stamped 2026-06-08 ✅.
- Offline write queue (Dexie outbox) - parity gap vs legacy `FirestoreService`, last-write-wins decided - Medium, ⏳.
- axe-core spine sweep shipped (`e2e/tests/a11y-spine.spec.ts`); broader U7 sweep still optional.
- Mortgage/debt tracking - **save/debt plan kinds + manual net-worth snapshot shipped**; auto net worth from import still deferred.
- Prod Supabase advisors: leaked-password protection (dashboard toggle, prod+staging) - ⏳ operator; `pg_net` in public (0014) - ⏳ re-enable via Dashboard on cloud (SET SCHEMA unsupported); extensions-in-public CI gate - ✅ (`scripts/check-security-advisors.sh`, excludes `pg_net`).

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
