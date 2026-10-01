# Promote and ship

How feature work reaches staging and production without changing the
`feature → dev → main` branch model or collapsing the separate Supabase projects.

## Daily commands

```bash
# Start from current origin/dev
./scripts/start-work.sh my-change

# After commits: gates → push → ready PR → merge-commit auto-merge (feature → dev)
./scripts/open-pr.sh
# Opt out: ./scripts/open-pr.sh --draft
# Opt out: ./scripts/open-pr.sh --no-auto-merge

# Promote staging → production (dev → main PR)
./scripts/promote.sh              # open/reuse PR; soft soak warning if no `promote` label
./scripts/promote.sh --merge      # wait for checks / enable auto-merge, then merge commit
./scripts/promote.sh --force      # silence soft soak warning
./scripts/promote.sh --dry-run    # gates + body preview only

# After production merge (CI also does this)
# .github/workflows/sync-dev.yml fast-forwards origin/dev
# Local fallback: ./scripts/sync-dev.sh --push
```

Agents: use the `/ship` skill (feature path by default; `/ship --promote` for promotion).

## Soft staging soak

After **Deploy staging** succeeds (including Real-DB smoke), CI comments on PRs
associated with the deployed SHA:

- Staging URL: https://dev.portfelik.pages.dev
- Add the GitHub label `promote` when staging looks good
- `./scripts/promote.sh` **warns** if no merged feature PR in
  `origin/main..origin/dev` carries `promote`; it does **not** hard-block
- `--force` silences the warning

Create the `promote` label once in the repo (color optional) if it does not exist.

## What not to automate

- Auto-push to `main` without a PR
- Squash or rebase between `dev` and `main` in a way that rewrites ancestry
- Collapsing staging away (separate Supabase project stays)

## Branch protection checklist (one-time)

Require these status check **names** on both `dev` and `main` (they always
appear; RLS/Playwright may no-op when out of scope):

From `CI` on pull requests:

- `Typecheck, lint, format, unit`
- `RLS regression`
- `Playwright E2E mocked`

Also require a pull request before merging, and prefer **merge commit** (not
squash) for `dev` ↔ `main` promotions and sync PRs so `sync-dev` stays a
fast-forward.

Optional but recommended:

- Allow auto-merge
- Restrict who can push to `main` / `dev`

Local `./scripts/open-pr.sh` / `pr-gates.sh` now include `pnpm test:components`
so skipped local gates cannot reach `dev` while CI would still fail that step.

## Agent `/ship` path

1. Dirty check → commit or stop
2. `./scripts/open-pr.sh` (ready + auto-merge for feature → `dev`)
3. Wait until the PR is merged (or report auto-merge waiting on checks)
4. Optionally watch **Deploy staging**
5. Stop. Promotion is explicit: `./scripts/promote.sh` or `/ship --promote`
