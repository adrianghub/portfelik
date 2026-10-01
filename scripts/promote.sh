#!/usr/bin/env bash
# scripts/promote.sh [--dry-run] [--merge] [--force]
# Promote staging (dev) to production (main) without changing the branch model:
# open/reuse a merge-commit PR, optionally wait for checks and merge, then rely
# on sync-dev.yml to fast-forward dev. Soft soak: warn when no `promote` label
# is present on recent feature PRs included in the promotion range.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
SCRIPT_DIR="$ROOT/scripts"

DRY=0
MERGE=0
FORCE=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --merge) MERGE=1 ;;
    --force) FORCE=1 ;;
    -h | --help)
      echo "usage: ./scripts/promote.sh [--dry-run] [--merge] [--force]"
      exit 0
      ;;
    *)
      echo "usage: ./scripts/promote.sh [--dry-run] [--merge] [--force]" >&2
      exit 2
      ;;
  esac
done

PROMOTE_LABEL="promote"
STAGING_URL="https://dev.portfelik.pages.dev"

if [ -n "$(git status --porcelain)" ] && [ "$DRY" -eq 0 ]; then
  echo "Refuse: working tree is dirty. Commit or stash before promoting." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Refuse: gh is required for promote.sh." >&2
  exit 1
fi

git fetch -q origin main dev

if ! git merge-base --is-ancestor origin/main origin/dev; then
  if git merge-base --is-ancestor origin/dev origin/main; then
    echo "Refuse: origin/dev is behind origin/main. Wait for sync-dev (or ./scripts/sync-dev.sh --push)." >&2
  else
    echo "Refuse: origin/main and origin/dev diverged. Resolve through a reviewed PR — do not squash or force-push." >&2
  fi
  exit 1
fi

if [ "$(git rev-parse origin/main)" = "$(git rev-parse origin/dev)" ]; then
  echo "Nothing to promote: origin/dev already matches origin/main."
  exit 0
fi

ahead="$(git rev-list --count origin/main..origin/dev)"
echo "Promotion range: origin/main..origin/dev ($ahead commit(s))."
echo "Staging: $STAGING_URL"

# Soft soak: warn unless a merged feature PR in the promotion range carries
# the `promote` label (or --force). Never a hard block.
has_promote=0
while IFS= read -r row; do
  [ -z "$row" ] && continue
  oid="${row%%$'\t'*}"
  labels="${row#*$'\t'}"
  if ! git merge-base --is-ancestor "$oid" origin/dev 2>/dev/null; then
    continue
  fi
  if git merge-base --is-ancestor "$oid" origin/main 2>/dev/null; then
    continue
  fi
  if printf '%s' "$labels" | grep -Eq "(^|,)${PROMOTE_LABEL}(,|$)"; then
    has_promote=1
    break
  fi
done < <(
  gh pr list --base dev --state merged --limit 50 \
    --json mergeCommit,labels \
    --jq '.[] | select(.mergeCommit != null) | [.mergeCommit.oid, ([.labels[].name] | join(","))] | @tsv' \
    2>/dev/null || true
)

if [ "$has_promote" -eq 0 ] && [ "$FORCE" -eq 0 ]; then
  echo "Soft soak: no merged feature PR in this range has the \`$PROMOTE_LABEL\` label." >&2
  echo "  Look at $STAGING_URL, then: gh pr edit <feature-pr> --add-label $PROMOTE_LABEL" >&2
  echo "  Or re-run with --force to silence this warning." >&2
elif [ "$has_promote" -eq 0 ]; then
  echo "Soft soak warning skipped (--force)."
else
  echo "Soft soak: found \`$PROMOTE_LABEL\` label on a feature PR in range."
fi

# Local tip of the integration branch for open-pr.sh gates + ancestry checks.
PREV_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git switch -q dev
git merge --ff-only -q origin/dev

restore_branch() {
  if [ "$PREV_BRANCH" != "dev" ] && [ "$PREV_BRANCH" != "HEAD" ]; then
    git switch -q "$PREV_BRANCH" 2>/dev/null || true
  fi
}
trap restore_branch EXIT

if [ "$DRY" -eq 1 ]; then
  bash "$SCRIPT_DIR/open-pr.sh" main --dry-run --no-auto-merge
  echo "----- dry run: no PR create/merge -----"
  exit 0
fi

# open-pr.sh on `dev` targets `main`. Never auto-merge production promotions
# from open-pr; --merge below is the intentional promotion step.
# Take the last https URL from stdout — open-pr may still print chatter.
PR_URL="$(bash "$SCRIPT_DIR/open-pr.sh" main --no-auto-merge | awk '/^https:\/\// {u=$0} END{print u}')"
if [ -z "$PR_URL" ]; then
  echo "Refuse: open-pr.sh did not return a PR URL." >&2
  exit 1
fi
echo "$PR_URL"

PR_NUMBER="$(gh pr view "$PR_URL" --json number --jq '.number')"

if [ "$MERGE" -eq 0 ]; then
  echo "Opened/updated production PR #$PR_NUMBER."
  echo "When ready: ./scripts/promote.sh --merge   # or merge the PR on GitHub as a merge commit"
  echo "After merge, sync-dev.yml fast-forwards origin/dev (fallback: ./scripts/sync-dev.sh --push)."
  exit 0
fi

echo "Waiting for required checks on #$PR_NUMBER…"
# Poll until mergeable or failed. Prefer enabling auto-merge so GitHub merges
# as soon as required checks pass (merge commit, never squash).
if gh pr merge "$PR_NUMBER" --auto --merge; then
  echo "Auto-merge enabled for #$PR_NUMBER (merge commit)."
else
  echo "Could not enable auto-merge; waiting for GREEN then merging…"
  for _ in $(seq 1 90); do
    state="$(gh pr view "$PR_NUMBER" --json state,statusCheckRollup,mergeStateStatus \
      --jq '{state, mergeStateStatus, checks: [.statusCheckRollup[]? | {name: .name, conclusion: .conclusion, status: .status}]}')"
    pr_state="$(printf '%s' "$state" | jq -r '.state')"
    merge_state="$(printf '%s' "$state" | jq -r '.mergeStateStatus')"
    if [ "$pr_state" = "MERGED" ]; then
      echo "PR #$PR_NUMBER already merged."
      exit 0
    fi
    pending="$(printf '%s' "$state" | jq '[.checks[] | select(.status != "COMPLETED")] | length')"
    failed="$(printf '%s' "$state" | jq '[.checks[] | select(.conclusion == "FAILURE" or .conclusion == "CANCELLED" or .conclusion == "TIMED_OUT")] | length')"
    if [ "$failed" -gt 0 ]; then
      echo "Refuse: required checks failed on #$PR_NUMBER." >&2
      printf '%s\n' "$state" | jq -r '.checks[] | select(.conclusion == "FAILURE" or .conclusion == "CANCELLED" or .conclusion == "TIMED_OUT") | "  x \(.name): \(.conclusion)"' >&2
      exit 1
    fi
    if [ "$pending" -eq 0 ] && { [ "$merge_state" = "CLEAN" ] || [ "$merge_state" = "HAS_HOOKS" ] || [ "$merge_state" = "UNSTABLE" ]; }; then
      if gh pr merge "$PR_NUMBER" --merge; then
        echo "Merged #$PR_NUMBER as a merge commit."
        echo "sync-dev.yml will fast-forward origin/dev."
        exit 0
      fi
    fi
    sleep 20
  done
  echo "Timed out waiting for checks on #$PR_NUMBER." >&2
  exit 1
fi

# Auto-merge armed — wait until merged or failure.
for _ in $(seq 1 90); do
  pr_state="$(gh pr view "$PR_NUMBER" --json state --jq '.state')"
  if [ "$pr_state" = "MERGED" ]; then
    echo "Merged #$PR_NUMBER."
    echo "sync-dev.yml will fast-forward origin/dev."
    exit 0
  fi
  failed="$(gh pr view "$PR_NUMBER" --json statusCheckRollup \
    --jq '[.statusCheckRollup[]? | select(.conclusion == "FAILURE" or .conclusion == "CANCELLED" or .conclusion == "TIMED_OUT")] | length')"
  if [ "$failed" -gt 0 ]; then
    echo "Refuse: checks failed while waiting for auto-merge on #$PR_NUMBER." >&2
    exit 1
  fi
  sleep 20
done

echo "Timed out waiting for auto-merge on #$PR_NUMBER." >&2
exit 1
