---
name: pr
description: Open or update a Portfelik pull request by running the repository PR opener. Use when the user asks to use /pr, open a PR, create a draft PR, update a PR body, preview a PR body, or run PR gates.
disable-model-invocation: true
---

# Portfelik PR

Use this skill to open or update a pull request for this repository.

## Workflow

1. Read `CLAUDE.md` / `AGENTS.md` branch and PR rules before acting.
2. Run the repository opener, not a hand-written PR flow:
   ```bash
   bash scripts/open-pr.sh $ARGUMENTS
   ```
3. If no arguments are supplied, let the script infer the base branch:
   - `dev` targets `main` (use `./scripts/promote.sh` for production promotions).
   - Other branches target `dev`.
4. Flags (only when the user asked):
   - `--dry-run` — preview body, no push/`gh`
   - `--draft` — keep draft (skips auto-merge)
   - `--no-auto-merge` — ready PR without enabling auto-merge
5. Feature → `dev` defaults: mark ready + enable **merge-commit** auto-merge.
   Relay the PR URL and whether auto-merge was enabled.
6. After a `dev` → `main` production PR merges, do **not** open a hand-rolled
   `main` → `dev` sync PR. `.github/workflows/sync-dev.yml` fast-forwards `dev`.
   If that workflow failed, run `./scripts/sync-dev.sh --push`.
7. For end-to-end “ship when green” (wait checks / optional promote), prefer the
   `/ship` skill.

## Guardrails

- Do not hand-fill `.github/pull_request_template.md`.
- Do not hand-write or manually edit the PR body.
- Do not bypass gates.
- If a real PR is blocked by a dirty worktree, tell the user the script requires commits first and list the current changed files.
