#!/usr/bin/env bash
# Keep the protected integration branch on the production branch's ancestry.
# Fast-forward origin/dev to origin/main. If branch protection rejects a direct
# push, open (or reuse) a main → dev PR and request a merge-commit auto-merge.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PUSH=0
if [[ "${1:-}" == "--push" ]]; then
  PUSH=1
elif [[ $# -gt 0 ]]; then
  echo "usage: ./scripts/sync-dev.sh [--push]" >&2
  exit 2
fi

SYNC_PR_MARKER="<!-- sync-dev-from-main -->"

gh_pr() {
  local cmd="$1"
  shift
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    gh pr "$cmd" --repo "$GITHUB_REPOSITORY" "$@"
  else
    gh pr "$cmd" "$@"
  fi
}

open_or_reuse_sync_pr() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "Refuse: origin/dev is behind origin/main, direct push was rejected, and gh is not available." >&2
    exit 1
  fi

  local number url
  number="$(gh_pr list --base dev --head main --state open --json number --jq '.[0].number // empty')"
  url="$(gh_pr list --base dev --head main --state open --json url --jq '.[0].url // empty')"

  if [[ -n "$number" ]]; then
    echo "Sync PR already open: #$number $url"
  else
    set +e
    url="$(
      gh_pr create \
        --base dev \
        --head main \
        --title "chore: sync dev from main" \
        --body "$(
          cat <<EOF
$SYNC_PR_MARKER

Fast-forward \`dev\` onto current \`main\` after a production promotion. Trees
should already match; this restores ancestry so \`start-work.sh\` can branch
from \`dev\`.

Merge as a **merge commit** (or a GitHub fast-forward). Do not squash or rebase
in a way that rewrites \`main\` commits.
EOF
        )"
      2>&1
    )"
    create_rc=$?
    set -e
    if [[ $create_rc -ne 0 ]]; then
      printf '%s\n' "$url" >&2
      echo "Refuse: could not open a main → dev PR." >&2
      echo "Enable Settings → Actions → Workflow permissions → Allow GitHub Actions to create and approve pull requests, or add repository secret SYNC_DEV_TOKEN (a PAT that can push to dev / open PRs)." >&2
      echo "Local fallback: ./scripts/sync-dev.sh --push" >&2
      exit 1
    fi
    echo "Opened sync PR: $url"
    number="$(gh_pr view "$url" --json number --jq '.number')"
  fi

  if gh_pr merge "$number" --auto --merge; then
    echo "Auto-merge requested for #$number (merge commit)."
  else
    echo "Could not enable auto-merge for #$number. Merge the PR as a merge commit, not squash."
  fi
}

git fetch origin main dev

if git merge-base --is-ancestor origin/main origin/dev; then
  echo "dev already contains origin/main."
  exit 0
fi

if ! git merge-base --is-ancestor origin/dev origin/main; then
  echo "Refuse: origin/main and origin/dev diverged. Resolve them through a reviewed PR." >&2
  exit 1
fi

if [[ $PUSH -eq 0 ]]; then
  echo "dev is behind main and can be fast-forwarded safely."
  echo "Run: ./scripts/sync-dev.sh --push"
  exit 1
fi

set +e
push_out="$(git push origin refs/remotes/origin/main:refs/heads/dev 2>&1)"
push_rc=$?
set -e
printf '%s\n' "$push_out"

if [[ $push_rc -eq 0 ]]; then
  echo "dev fast-forwarded to origin/main."
  exit 0
fi

if printf '%s\n' "$push_out" | grep -Eq 'GH013|pull request|protected branch|rule violations'; then
  open_or_reuse_sync_pr
  exit 0
fi

exit "$push_rc"
