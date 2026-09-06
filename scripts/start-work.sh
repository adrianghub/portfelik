#!/usr/bin/env bash
# Start feature work only from a clean, current integration branch.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

NAME="${1:-}"
if [[ -z "$NAME" || $# -gt 1 ]]; then
  echo "usage: ./scripts/start-work.sh <branch-name>" >&2
  echo "Example: ./scripts/start-work.sh codex/import-review" >&2
  exit 2
fi

if [[ "$NAME" == */* ]]; then
  BRANCH="$NAME"
else
  BRANCH="codex/$NAME"
fi

git check-ref-format --branch "$BRANCH" >/dev/null

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refuse: working tree is dirty. Commit or stash the current work first." >&2
  exit 1
fi

git fetch origin main dev

if ! git merge-base --is-ancestor origin/main origin/dev; then
  if git merge-base --is-ancestor origin/dev origin/main; then
    echo "Refuse: dev is behind main." >&2
    echo "Run ./scripts/sync-dev.sh --push, then start work again." >&2
  else
    echo "Refuse: origin/main and origin/dev diverged. Resolve them through a reviewed PR." >&2
  fi
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Refuse: local branch $BRANCH already exists." >&2
  exit 1
fi

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "Refuse: remote branch $BRANCH already exists." >&2
  exit 1
fi

git switch dev
git merge --ff-only origin/dev
git switch -c "$BRANCH"

echo "Started $BRANCH from current dev."
