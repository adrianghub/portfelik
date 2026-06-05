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

**Current implementation note:** user-facing Plans still use `shopping_lists`
and `shopping_list_items` internally. Treat those names as compatibility storage.
Future plan settlement should use a dedicated plan-to-transaction link model.

**Bank import direction:** review should be an exception surface. Clean rows
import by default, duplicates are folded, uncategorized rows go through the
visible `Inne` confirmation path, and `pending` should be reserved for genuine
risk or explicit deferment. No shipped forced rule-capture gate exists; rule
capture is a convenience around category choices.

**Alerts direction:** alerts should reinforce the core product loop, not become
a generic task system. Import reminders are the first alert: opt-in profile
setting, 7/14/30-day cadence, based on committed import sessions, delivered via
the in-app notification row with push as an optional channel.

**Bank import P0 exception-review remediation (issue #66 follow-up, 2026-06-04, branch `fix/import-exception-review-p0`):** the review is now a true exception-review surface. Removed the `queueInitialized` blanket flip in `ImportReviewFlow.svelte` that turned every default-import row into `pending` - it fought the issue #73 default-import model and forced a per-row decision on clean statements. Rows now stay as the deterministic engine decides them (`import`/`duplicate`); a fully auto-categorized statement is one-click committable; uncategorized rows stay `import` and flow to `Inne` via the confirm sheet; `pending` ("Do decyzji") is reserved for rows the user explicitly defers (skip / duplicate-restore). Default selected filter is now `all`, leading with `pending` only when rows await a decision (no empty first screen). E2E mock now faithfully inserts `decision:"import"` (matching `bank-import.ts:302`); +1 bulk-action test; bank-import Playwright 14/14. svelte-check 0/0, lint 0 errors (5 pre-existing Paraglide warnings), format clean, changed-file secret scan clean. P1-3 (editable description on mobile + ungated from counterparty) and P1-6 (decision controls: 44px mobile touch target, desktop text labels, focus-visible ring; `aria-label` retained for icon-only mobile) landed 2026-06-04. P1-5 verified via live EXPLAIN: Path A uses `transaction_import_links_fingerprint_idx (user_id, fingerprint)`, Path C uses the dedicated `idx_transactions_manual_duplicate_scan_user (user_id, type, amount, currency)` anti-join - dedup scans are well-indexed, no schema change; only the minor `OR is_group_member()` arm can't use the composite index (negligible at personal-finance scale - revisit only if a heavy group-shared history shows slow preview/commit). P1-4 row virtualization landed 2026-06-04 (branch `perf/import-review-virtualization`): chunked infinite render in `ImportReviewCategorizeStep.svelte` (CHUNK_SIZE=60, IntersectionObserver sentinel, window resets on filter/sort) - all rows stay mounted (no unmount-on-scroll, so focus/sticky/portal'd combobox can't regress), cheap initial paint at 500 rows; bulk actions/filter counts still run on full `visibleRows`. New Playwright large-import test (500 rows) asserts full count tracked, initial DOM windowed (<200 rows), and scroll reveals the last row (no blank-window/lost-row). bank-import Playwright 15/15, svelte-check 0/0, lint 0 errors, format + secret scan clean. P2 partial landed 2026-06-04 (branch `imp/bank-import-rows-perf` stack): +4 Playwright cases (zero-amount dropped -> skipped banner; resume unsaved draft after reload via `fetchActivePreviewSession`; leave-guard discard on navigate-away; duplicate pre-scan failure now surfaces a non-blocking toast instead of silent swallow - `FileUpload.svelte` + new `bank_upload_duplicate_scan_failed` message). Mock harness extended with an active-preview-session branch + `failMarkDuplicatesOnce`. bank-import Playwright 19/19, svelte-check 0/0, lint 0 errors, format + secret scan clean, paraglide recompiled. P2-8 component/service infra landed 2026-06-04: added `@testing-library/svelte` + `@testing-library/dom` + `jsdom` (devDeps) and a third vitest config `vitest.components.config.ts` (jsdom env, inline svelte preprocess via configFile:false so the SvelteKit `kit` adapter config is not loaded). Service tests live in `tests/services/**` (folded into `vitest.unit.config.ts`, node env, `vi.mock("$lib/supabase")` so the $env import never evaluates) - 13 cases for `bank-import.ts` (insert payload user_id/adapter-kind, excludes-cancelled, active-preview query shape, rows_total, field mapping, soft-cancel, commit RPC + error throw). Component tests in `tests/components/**` - 11 cases for `SingleValueCombobox` (open/filter/select/create/keyboard/Escape) + `ImportCategoryCombobox` (clear chip, select->id, inline create->id). New `test:components` script wired into ci + deploy workflows. NOTE: component tests need real `input.focus()` (not `fireEvent.focus`) because the combobox self-closes when `document.activeElement !== input`, which jsdom's fireEvent.focus does not set. Gates: svelte-check 0/0 (6185 files incl. specs), lint 0 errors, prettier clean, test:unit 47/47 (units+services), test:components 11/11, bank-import Playwright 19/19. `FileUpload.svelte` component test intentionally skipped (heavy decode/detect/multi-service; already e2e-covered). Use corepack pnpm (v11) for installs - the repo's node_modules is linked from the pnpm v11 store.

**Pre-beta readiness pass (2026-06-05, branch `dev`):** #81 made the privacy
posture credible; this pass closes the cheap gating items so trusted testers can
be onboarded before building Plan settlement. (1) Service-role/client exposure
audit — **clean** (no `service_role` in client `src`, no `PUBLIC_`-prefixed
secret, example envs placeholder-only, CI keys via `${{ secrets.* }}`, no secret
echoed to logs); repeatable procedure in the new Layer-2 runbook §3. (2) Layer-2
ops-lockdown runbook authored: `docs/runbooks/ops-access-lockdown.md` (access
roster, infra-credential inventory, revocation, access-review schedule) — operator
must still verify Supabase dashboard members match the roster. (3) Privacy policy:
`docs/legal/privacy-policy.md` + in-app `/privacy` route (Polish, plain-language;
not-E2E, who can access, masked admin, deletion now / export partial); linked from
login page + Settings → Profile; `/privacy` added to `PUBLIC_PATHS`. (4) Beta
onboarding note: `docs/product/beta-onboarding-note.md` (beta status, upload only
needed history, not-E2E, deletion, partial export). (5) Full account export
**documented as a beta limitation**, not built (CSV tx export stays; full export
planned pre-public). Readiness checklist in
`docs/architecture/flows/admin-diagnostics-privacy.md` updated. Gates: svelte-check
0/0, lint 0 errors (5 pre-existing Paraglide warnings), prettier clean (src+docs),
changed-file secret scan clean (only false positives: documented regex + pre-existing
`password` var), Paraglide recompiled, Svelte autofixer clean on the new page.

**Immediate next step:** operator-side: verify production Supabase dashboard
members match the Layer-2 roster, then onboard the first trusted testers using the
beta note. Product-side: Plan settlement is the MVP+ centerpiece — brainstorm →
spec → `plan_transaction_links` model + RPCs per
`docs/architecture/flows/plan-settlement.md` (deterministic-first; do not expand
`transactions.shopping_list_id`).

**Open backlog:**

- Vault secret rotation runbook (`docs/runbooks/secret-rotation.md`) - authored ✅; ops-lockdown runbook (`docs/runbooks/ops-access-lockdown.md`) - authored ✅.
- Offline write queue (Dexie outbox) - parity gap vs legacy `FirestoreService`, last-write-wins decided - Medium, ⏳.
- axe-core a11y sweep (deferred U7).
- Virtualized/infinite scroll for long transaction lists.
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
