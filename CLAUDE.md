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

**Beta gate note (2026-06-13):** beta-gate closure — gates 1 & 2 **DONE**, gate 3 + invite remain. (1) ✅ trust fix + alignment pass landed on `main` via #142; migrations `20260703`–`20260705` verified applied to prod Supabase (`list_migrations`). dev fast-forwarded to `04a608b` and pushed (branches synced 0/0). (2) ✅ `seed-personas.mjs` verified idempotent (`cleanupDemoRows`→`seedDemoRows` per persona, `DEMO_PREFIX`-keyed, `group_members` via `user_groups` FK cascade); staging audit found prefixed demo data clean (txs 60/60, plans 9/9, cats 12/12, 0 dups) — the "3×" was the 3 demo personas, not a bug; one stray exact-dup tx (import double-commit under `demo@portfelik.dev`) deleted, staging now 0 exact-dup transactions. (3) **DEFERRED (2026-06-13):** leaked-password protection is a **paid** Supabase tier feature — descoped for beta, not a blocker; revisit if/when on a paid plan. Prod advisor will keep WARN `auth_leaked_password_protection` until then (expected). **Phase 0 closed** → invite first test couple (50/50 single/couple cohort per `docs/NEXT_STEPS_BRAINSTORM` Phase 0). Pre-invite must-have: stand up beta instrumentation (Phase 1) so meters run on day one. Remaining review backlog: `/plans` zero-state dedupe, detect-banner E2E case, terms-edit cancel + input disabling, PlanForm extraction, Dashboard error state.

**Debt-engine simplification + refinance (2026-06-17, local on `feat/debt-engine-simplification`):** debt live balance is now a single pure scheduled-amortization engine (`services/debt-schedule.ts`): `buildSchedule`/`scheduleBalanceAt`/`liveBalance` step the balance monthly (odd first-period gap interest, neg-amort guard) and re-anchor only on real linked payments — **no daily ticking**, no first-principles daily compounding. `debt-balance-replay.ts` deleted; `plan-debt.ts` delegates to the engine; 7 caller surfaces (net worth, PlanCard, DashboardPlanProgress, detail/scenarios/settle pages, DebtPlanDetail) repointed. New optional terms `first_payment_date` / `first_payment_amount` (migration `20260710000000`, backfills date = `plans.start_date`) model odd/larger opening installments off the loan agreement. **Refinance** is a no-money flow (migration `20260711000000` adds `plans.status` active|refinanced|closed + `refinanced_from_plan_id` / `replaced_by_plan_id`): `services/plan-refinance.ts` `refinanceDebtPlan` inserts the new debt plan + terms, archives the old plan (status=refinanced, links the replacement), rolls back the new plan on failure (terms cascade via FK), and writes **zero transactions** (cash wash nets to zero). UI: first-payment fields in the debt create/edit form; a "Refinansuj kredyt" accordion + lineage badges in `DebtPlanDetail`. Gates: svelte-check 0/0, lint 0 err (5 pre-existing generated-paraglide warnings), format clean, unit 217/217, RLS 266/266, E2E plans+settle 13/13 (incl. new refinance case asserting no tx POST), extension-in-public advisor OK, secret scan clean. Migrations applied locally via `db reset`; backfill verified (`first_payment_date` = start_date). Unit now 223/223 (`isLivePlan` refinanced-exclusion coverage). **Not yet on prod/staging; awaiting PR + the two migrations applied to prod Supabase.** ✅ **Status double-count gap fixed** (`9103a39`): `isLivePlan` (status==='active') now gates net worth, monthly obligations, planning-queue debt chip, and the hub debt list so refinanced/closed plans don't double-count. Full review in `docs/HANDOVER-debt-engine-refinance-2026-06-17.md`.

**Derived cash position — Phase A + B (2026-06-18, `feat/cash-position-phase-b`):** net worth's cash is now derived from transactions instead of typed by hand — no per-bank "accounts". **Phase A (merged to dev via #150):** one `cash_positions` pool per scope (`owner_id` XOR `group_id`, migration `20260712000000`, plain unique indexes for upsert ON CONFLICT, RLS owner/member read + owner/co-owner write, scope-lock BEFORE UPDATE trigger); pure engine `services/cash-position.ts` (`livePosition` = opening + Σ paid on/after `as_of_date`; `forecastPosition` adds upcoming); `/plans` net-worth form seeds the anchor (cash_amount kept 0). **Phase B (this branch):** `runningBalances()` per-row engine + tests; `CashPositionStrip` (live + faint forecast, set-hint when no anchor); opt-in `runningBalanceById` "Saldo" column in `TransactionTable`; Transakcje page wires a private-pool paid-history query (`anchorStart`→`"9999-12-31"` sentinel, group rows excluded) so strip + running balance reflect the full pool independent of month/category filters, **private scope only** (`?group=own`; default scope is "all" → both hidden); quick-view preset chips (Wszystkie / Bez planu = `view=unlinked` via now-exported `fetchLinkedTransactionIds` / Inne = `view=inne` matching the two import fallback categories "Inne wydatki"·"Inne przychody" / Ten miesiąc), all URL-driven over the shared filter state. Reflow needs no new wiring — import-commit + single/bulk delete invalidate `["transactions"]`, which prefix-matches `["transactions","cash-history",…]`. Gates: svelte-check 0/0, lint 0 err (5 pre-existing paraglide warnings), format clean, unit 232/232, new E2E `cash-position.spec.ts` 2/2, transactions+plan-settle E2E 21/21, secret scan clean. **Not yet on prod/staging; migration `20260712000000` already rode in with #150 to dev — awaiting Phase B PR into dev + prod apply.**

**Plans spend-kind removal (2026-06-19, local on `feat/remove-expense-plans-ui-polish`):** removed redundant `spend`/expense plans from the UI and product model; `/plans` now creates and lists only `save` goals and `debt` loans. Migration `20260715000000_remove_spend_plans.sql` deletes old spend plans, drops the `plans.kind` DB default, narrows the check to `save|debt`, and replaces `link_plan_transaction` with kind-aware enforcement (save→income, debt→expense). Surplus copy uses neutral balance wording; docs and RLS fixtures updated. Gates: Svelte MCP clean on edited settle route, svelte-check 0/0, lint 0, format clean, unit 236/236, RLS 284/284, build OK, migration SQL validated/applied locally via `psql` because local migration history had unrelated later versions, secret scan clean.

**Forecast trust polish + actionable recurrence (2026-06-24, local):** dashboard stacked bars drill into exact transaction ranges for past and projected periods; projected bars add `status=upcoming&forecast=recurring` and preserve scope/type. Recurrence is now hybrid: migration `20260721000000_actionable_recurring_occurrences.sql` restores `transactions.recurring_template_id` with `recurring_occurrence_date` plus `recurring_occurrence_skips` memory, so current/next-period occurrences are real manageable `upcoming` rows while farther periods remain read-time forecasts. Generated rows can be edited/settled/deleted; delete records a one-off skip so sync/forecast does not recreate that slot. Added `InfoTooltip`, shorter natural PL hint copy, forecast/savings explanations, Bilans stat-row alignment, and neutral attention empty copy. Gates: Paraglide compile, Svelte MCP clean on edited transaction components, svelte-check 0/0, lint 0, format clean, unit 307/307, RLS 306/306 (+ recurring skip coverage), transactions E2E 17/17, `supabase db reset` clean through `20260721`, diff check clean, secret scan clean.

**Dashboard deterministic actions — slice 1 (2026-06-24, local on `feat/dashboard-actions`):** GitHub Project 6 card "[DASHBOARD] … deterministic analysis … actions to perform derived from data" (roadmap #1/#2 in `future-paths.md`; foundation AI sits on). Finding: the deterministic cores already exist but the dashboard underuses them. New pure aggregator `services/dashboard-actions.ts` (`buildDashboardActions`) folds already-computed signals into ONE ranked, deep-linked, dismissible "Co wymaga uwagi" surface — no new financial math. `DashboardAttention.svelte` → `DashboardActions.svelte`. Wired this slice: existing attention (overdue/stale-import/off-track-save) + **spending anomalies** (`computeSpendingInsight.categories[].anomaly`, previously computed-but-unsurfaced) + **settle-ready** (`PlanSettlementProgress.eligibleCount`). Persistent accepted/rejected memory: migration `20260720000000_action_dismissals.sql` (per-user, owner-only RLS, narrow grants, `dismissed_until` null=permanent / future=snooze), service `services/action-dismissals.ts`, optimistic dismiss + "Cofnij" undo toast. Anomaly dismiss keys are period-scoped (`spending_anomaly:{cat}:{periodStart}`) so a later spike re-surfaces. Aggregator already supports `debt_detected` / `surplus` / `debt_due` kinds (tested) but those are **deferred to slice 2** (each needs multi-query wiring + exclude-already-linked correctness; planning-queue's unique cards are low-value muted). Gates: paraglide compiled, svelte-check 0/0, lint 0, format clean, unit 307/307, RLS 306/306 (+5 `action_dismissals` and +4 `recurring_occurrence_skips`), full E2E 71/71, secret scan clean, `git diff --check` clean. `supabase db reset` replayed all migrations incl. `20260720` and `20260721` cleanly. **Not on prod/staging; awaiting PR + migration apply.**

**Dashboard polish & forecast correctness — Spec 1 (2026-06-26, local, post-#169):** review batch after #169 merge (spec `docs/specs/2026-06-26-dashboard-polish-forecast-correctness-design.md`). (1) **Forecast chart = transactions:** dashboard `forwardBuckets` previously bucketed recurring projections only — under-reporting and leaving forecast bars near-empty. New pure helper `forwardForecastTransactions` (`services/transaction-projections.ts`) unions scheduled real rows (upcoming/overdue) with deduped projections, so the chart's forecast region now matches the `/transactions` upcoming list (one-off upcoming + materialized recurring rows included, no double-count). (2) **Bar click-through fixed:** the transparent band hit-rect was eating `onbarclick`; switched to layerchart's `ontooltipclick` (band-mode click) → clicking any bar navigates to `/transactions` with period + `status=upcoming&forecast=recurring` for forecast bars. (3) **"Teraz" → bold current period** on the x-axis (MutationObserver tick action), divider line kept. (4) **InfoTooltip** portaled to `<body>` + viewport-clamped (fixes BILANS/savings tooltip clipping at card edges). (5) **Mobile:** chart tooltip width-capped + `overflow-x-hidden` → no horizontal scrollbar at 375px. (6) **Attention copy:** anomaly card rewritten to a natural action ("{name}: wyżej niż zwykle" + "Sprawdź wydatki w tej kategorii"), dropped the `≈N×` metric. (7) **Treemap** smallest-cell label thresholds lowered + outline → bottom-right cell legible. (8) PL forecast copy polished. Gates: svelte-check 0/0, lint 0, format clean, unit 312/312 (+5 forward-forecast), secret scan clean; **live-verified in browser** (375px: tooltip in-viewport, no h-scroll; current period bold; forecast bar present; bar click navigates). Awaiting manual commits. **Spec 2 (recurring/upcoming management: `recurrence_end_date`, series actions, balance impact) brainstormed, not started.**

**Recurring series management — Spec 2 (2026-06-26, on `feat/recurring-series-management`, merged to `dev` via #171):** migrations `20260722000000` (template-only `recurrence_end_date` + refreshed view) and `20260723000000` (authenticated column-level update grant) replay cleanly. Projection/materialization stop at the inclusive end date; shortening a template prunes already materialized future upcoming rows. Detail sheets now offer scoped series actions from projected and materialized occurrences (edit this/all; skip this; end this-and-future); templates safely expose only whole-series edit/end-from-today. Projected skips persist by template/date without writing a synthetic id into the FK. Private-only `Saldo` continues through upcoming/projected rows, with a visible `Przewidywane saldo`; group/all scope stays intentionally hidden pending Spec 3. Gates: svelte-check 0/0, lint 0, format clean, unit 322/322, RLS 306/306, focused transactions+cash E2E 21/21, `supabase db reset` clean through `20260723`, diff check clean.

**Recurring management page (`/recurring`) (2026-06-26, on `feat/recurring-page`):** dedicated page listing active recurring series (title, cadence, scope badge, next date, amount). Actions gated by `canManageTransaction`: "Edytuj serię" opens `TransactionDialog` with the template; "Zakończ od dziś" via `ConfirmDialog` sets `recurrence_end_date` to yesterday and prunes future materialized rows. Entry links: dashboard status band "Cykliczne (N)" + transactions header "Cykliczne" (desktop). Page is NOT in main nav. E2E `recurring.spec.ts` 5/5 (list renders, edit opens dialog, end confirms + empties, transactions link, dashboard link). Gates: svelte-check 0/0, lint 0, format clean, unit 331/331, secret scan clean.

**Beta hardening & doc sync (2026-06-26, on `feat/beta-hardening-polish`):** small promotion-readiness pass in a separate worktree. Product/docs now reflect current save/debt Plans, actionable recurring occurrences, private cash-position semantics, and deterministic dashboard actions; stale shopping-list/realtime ADR examples removed; database docs point to the actual `20260718000000_remove_spend_plans.sql` migration. Plan detail now uses mapped `toastError(err)` failures and retryable `QueryError` instead of generic error copy. Gates: svelte-check 0/0, lint 0, format clean, `supabase db reset` clean through `20260723`, diff check clean, secret scan clean. No schema changes.

**Immediate next step (2026-06-26):** merge the beta-hardening PR into `dev`, then apply migrations `20260720`–`20260723` to staging and run staging smoke. If clean, promote `dev` → `main`, apply the same migration set to production, and run production smoke. After promotion, start Spec 3: group-scope cash position (live + forecast together). Deferred: dashboard slice 2 (`debt_detected`, planning-queue surplus/debt_due), field-scoped search, AI/Capacitor prep.

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
