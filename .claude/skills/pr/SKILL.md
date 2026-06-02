---
name: pr
description: Open or update a Portfelik pull request by running the repository PR opener. Use when explicitly invoked with /pr.
argument-hint: "[base-branch] [--dry-run]"
disable-model-invocation: true
allowed-tools: Bash
---

# Portfelik PR

Run the portable opener and relay its important output:

```bash
bash scripts/open-pr.sh $ARGUMENTS
```

- It auto-detects the base branch (`dev` -> `main`, otherwise `dev`); pass a base to override only when the user supplied one.
- It runs every gate via `scripts/pr-gates.sh` and blocks without opening a PR if any fails.
- New PRs are created as drafts.
- Existing open PRs for the branch are updated in place.
- On success, report the PR URL.
- On gate failure, report the failing gate and detail.
- Do not hand-fill `.github/pull_request_template.md`, hand-write the PR body, or bypass gates.
