#!/usr/bin/env bash
# Keep the protected integration branch on the production branch's ancestry.
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

git push origin refs/remotes/origin/main:refs/heads/dev
echo "dev fast-forwarded to origin/main."
