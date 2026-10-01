---
name: ship
description: Ship Portfelik feature work to staging via official scripts. Use when the user says /ship, ship it, merge when green, or asks to open a PR and wait for CI. Pass --promote only when they explicitly want production promotion.
disable-model-invocation: true
---

# Portfelik /ship

Thin wrapper around repository scripts. Do **not** invent a parallel `gh` flow.

## Default (feature → staging)

1. Read `CLAUDE.md` branch rules and `docs/runbooks/promote-and-ship.md`.
2. If the worktree is dirty, stop and list changed files — require commits first
   (or ask the user to commit).
3. Run:
   ```bash
   bash scripts/open-pr.sh $ARGUMENTS
   ```
   Omit flags unless the user asked for `--draft`, `--no-auto-merge`, or
   `--dry-run`. Feature PRs target `dev` by default.
4. Report the PR URL. Feature → `dev` enables merge-commit auto-merge unless
   opted out; wait for checks with `gh pr checks --watch` (or poll
   `gh pr view --json state,statusCheckRollup`) and report merged vs waiting.
5. Optionally watch **Deploy staging** for the merge commit on `dev`. Do **not**
   promote to production unless the user passed `--promote` or asked explicitly.

## `--promote` (staging → production)

Only when the user asked to promote / ship to production:

```bash
bash scripts/promote.sh --merge
```

Add `--force` only if they explicitly want to silence the soft soak warning.
After merge, do **not** open a hand-rolled sync PR — `sync-dev.yml` owns that.
Fallback if sync failed: `./scripts/sync-dev.sh --push`.

## Guardrails

- Never push to `main` without a PR.
- Never squash `dev` ↔ `main`.
- Never bypass `open-pr.sh` / `promote.sh` gates.
- Soft soak (`promote` label) warns; it is not a hard block unless the user
  wants to stop and look at https://dev.portfelik.pages.dev first — prefer that.
