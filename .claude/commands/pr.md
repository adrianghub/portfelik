---
description: Run all PR gates and, if green, auto-open/update the PR with a fully generated body. Blocks on any gate failure.
argument-hint: [base-branch] [--dry-run]
allowed-tools: Bash
---

# Open a Pull Request

Run the portable opener and relay its output verbatim:

```bash
bash scripts/open-pr.sh $ARGUMENTS
```

- It auto-detects the base branch (`dev` → `main`, otherwise `dev`); pass a base to override.
- It runs every gate via `scripts/pr-gates.sh` and **blocks without opening a PR** if any fails — report which gate failed and its detail.
- New PRs are created as **drafts** (`gh pr create --draft`); mark ready manually when you want review.
- An existing **open** PR for the branch is updated in place. Merged/closed PRs are ignored, so a new draft is opened instead of reprinting a dead one.
- On success it prints the PR URL. Do not hand-edit the body; it is generated.
- Pass `--dry-run` to preview the body without pushing or calling `gh`.
