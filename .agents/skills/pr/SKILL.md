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
   - `dev` targets `main`.
   - Other branches target `dev`.
4. Pass a base branch only when the user supplied one. Pass `--dry-run` only when the user asked for a preview or the real PR cannot be opened safely.
5. Relay the important script output to the user:
   - On gate failure, report the failing gate and the detail the script printed.
   - On success, report the PR URL.

## Guardrails

- Do not hand-fill `.github/pull_request_template.md`.
- Do not hand-write or manually edit the PR body.
- Do not bypass gates.
- If a real PR is blocked by a dirty worktree, tell the user the script requires commits first and list the current changed files.
