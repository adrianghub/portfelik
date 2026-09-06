# Handover — UI density and safe branch flow (2026-09-06)

## Executive state

- Working branch: `codex/ui-density-pass`.
- Base: `32d7fe6`, shared by remote `main` and `dev` after a verified
  fast-forward sync.
- Delivery target: draft PR
  [#220](https://github.com/adrianghub/portfelik/pull/220) from
  `codex/ui-density-pass` to `dev`.
- Production and staging still contain the trust/readiness package merged
  earlier. The UI-density and workflow commits described here are not yet in
  `dev` or `main` at this snapshot.

Commits, oldest first:

1. `3000c08 feat(ui): tighten desktop financial layouts`
2. `08a96f7 test(transactions): freeze recurring forecast clock`
3. `06c2857 chore(workflow): enforce safe branch flow`
4. `01cd7ef docs(handover): record ui and branch-flow state`

## What changed

### UI density

- Dashboard desktop overview is now a 5/7 grid: balance on the left, spending
  insight and history chart stacked on the right. This removes the large empty
  area below the spending insight. Loading skeletons mirror the final layout.
- Dashboard Status uses two independent vertical lanes, so a short action card
  no longer inherits the height of a longer plan-progress card.
- Plans use the same `max-w-5xl` desktop width as the dashboard. Net worth and
  monthly cashflow form a 7/5 overview row; saving goals and debts form separate
  desktop columns while remaining a single mobile stream.
- Transactions use `max-w-5xl`, improving table and summary density.
- Actual 1440 px renders were inspected. Mobile overflow and accordions were
  covered by Playwright.

### Test stability

- The far-future recurring forecast E2E case had a fixed September occurrence
  but used the real clock. It started failing on 2026-09-06 because the
  occurrence on September 5 was no longer upcoming. The test now freezes its
  own clock at 2026-06-01 and is deterministic.

### Branch safety

- `scripts/start-work.sh <branch-name>` is the canonical feature-branch entry
  point. It fetches both long-lived branches and refuses dirty state, stale or
  diverged `dev`, and reused local/remote branch names.
- `scripts/sync-dev.sh --push` performs only the safe case
  `origin/dev` ancestor of `origin/main`; it refuses real divergence and never
  rebases or force-pushes.
- `scripts/check-branch-flow.sh` permits feature PRs into `dev` and only
  `dev -> main` production promotion. It runs at the start of the required CI
  quality job and from `scripts/open-pr.sh`.
- `scripts/open-pr.sh` now treats a failed remote fetch as blocking instead of
  silently using stale tracking refs.
- The GitHub `main` ruleset was updated outside Git: PRs are required and only
  merge commits are allowed. Existing status checks and owner emergency bypass
  remain intact. This preserves `dev` ancestry during production promotion.
- Remote `dev` was fast-forwarded from `4b4ffcf` to `32d7fe6`, matching `main`.
  GitHub recorded the existing owner bypass because `dev` requires PRs; the
  operation was ancestry-checked before the push and triggered the full staging
  workflow.

### CI scope and production probe

- Quality remains mandatory and always runs.
- Required `RLS regression` and `Playwright E2E mocked` jobs now start their
  expensive toolchain only when the diff can affect that area. Their status
  contexts remain present and successful as fast no-ops for unrelated changes.
- The same scope rules apply to pull requests and pushes to `dev`/`main`.
  Unknown initial-push history falls back to running the full job.
- Production run
  [33989006040](https://github.com/adrianghub/portfelik/actions/runs/33989006040)
  was not a production outage. Auth health returned 200, while the probe
  incorrectly expected an anonymous read of the user-owned `categories` table
  to return 200. The publishable key has the `anon` role without a user session,
  so 401 is the intended boundary. The probe now validates auth/key health with
  200 and Data API reachability plus access isolation with the expected 401.

## Verification evidence

- Svelte check: 0 errors, 0 warnings.
- Lint and Prettier: clean.
- Unit: 437/437.
- Components: 17/17.
- Mocked Playwright: 83 passed, 1 intentionally skipped.
- Production build: passed.
- Targeted accessibility spine: passed for dashboard, transactions, plans,
  import, and settings.
- Draft PR #220 completed its pre-optimization GitHub run successfully: quality,
  RLS, mocked E2E, and secret scan all passed. Its next run intentionally runs
  both heavy jobs once because it changes their workflow definitions; later
  unrelated PRs/deploys should exercise the fast no-op paths.
- Branch scripts: `bash -n`, positive/negative direction checks, and a temporary
  bare-remote integration test covering feature start plus `main -> dev`
  fast-forward all passed.
- Sync-triggered staging workflow:
  <https://github.com/adrianghub/portfelik/actions/runs/34016164732> — stopped
  before migration/deploy because the old `dev` snapshot still contained the
  date-dependent recurring forecast test. Result: quality and RLS passed; E2E
  82 passed, 1 skipped, and only that known test failed twice. Commit `08a96f7`
  is the verified fix and must reach `dev` through the feature PR.

## Exact next steps

1. Update draft PR #220 with `./scripts/open-pr.sh dev` after any final commit.
2. Confirm the feature PR's required checks are green; its deterministic test
   fix is expected to clear the failure from the sync-triggered run above.
   Confirm that RLS and Playwright execute normally because this PR changes
   their workflow definitions.
3. Review the desktop dashboard and Plans page on the PR/staging build, then
   merge to `dev` only after required checks pass.
4. Validate staging with both seeded personas and record concrete evidence for
   export, account deletion, and bank-format confirmation.
5. Update the readiness audit statuses; do not begin assignment persistence
   until every P0/P1 blocker is closed or explicitly reclassified.

## Monthly money jobs — product context

The requested direction is to give current household money explicit monthly
jobs such as rent, a weekend, a sofa, holidays, an emergency buffer, or a down
payment. The desired emotional outcome is control, resistance to lifestyle
inflation, and guilt-free spending. Gamification and fantasies are later layers
over healthy, reconciled financial habits.

The design contracts exist, but persistence and UI do not:

- `docs/product/monthly-money-availability.md` defines trusted private live,
  assigned, and unassigned cash.
- `docs/product/monthly-money-jobs.md` defines append-only events, carry-over,
  overspending, online-only writes, idempotency, and the gamification boundary.
- `apps/web-svelte/src/lib/services/money-availability.ts` implements the pure
  calculation engine.
- `docs/specs/2026-09-05-monthly-money-jobs-readiness-audit.md` remains the
  gate. Its candidate/staging wording needs a refresh after manual validation.

Do not wire the engine with `assignedCash = 0` as a placeholder. That would
falsely label all trusted cash as free. The next domain implementation requires
real assignment storage and atomic/idempotent transitions first.

## Known remaining risks and decisions

- Manual staging proof for export, account deletion, and bank confirmation was
  interrupted and remains the main trust-readiness gap.
- No bank adapter has privacy-safe real-export certification yet. Synthetic
  fixtures prove parser contracts, not current bank exports.
- Group cash remains intentionally unsupported for money jobs. The first
  assignment release is private-only.
- Current plan settlement is whole-transaction and exclusive. Money-job splits
  require separate amount-bearing assignment records.
- Status cards are denser, but product prioritization inside that band may be
  revisited after observing real staging data; avoid adding decorative cards to
  fill space.
- `sync-dev.sh --push` deliberately uses the repository owner's existing bypass
  for a verified fast-forward. If ownership or ruleset bypass changes, replace
  this with a reviewed `main -> dev` sync PR rather than weakening protection.
- The corrected production probe is locally verified against the live Supabase
  endpoint, but its end-to-end GitHub evidence requires the next `main` deploy.

## Operating commands for the next agent

```bash
# Confirm state
git status --short --branch
git log -3 --oneline
git fetch origin main dev

# Open this branch's PR after reviewing this handover
./scripts/open-pr.sh dev

# Start later feature work only after this branch is merged
./scripts/start-work.sh <branch-name>

# Immediately after a future dev -> main production promotion
./scripts/sync-dev.sh --push
```

Never force-push, rebase, or squash between `dev` and `main`. Feature branches
may be short-lived; the two environment branches must retain ancestry.
