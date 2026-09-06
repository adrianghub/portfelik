#!/usr/bin/env bash
# Validate the only supported pull-request directions.
set -euo pipefail

BASE="${1:-${GITHUB_BASE_REF:-}}"
HEAD="${2:-${GITHUB_HEAD_REF:-}}"

BASE="${BASE#refs/heads/}"
HEAD="${HEAD#refs/heads/}"

if [[ -z "$BASE" || -z "$HEAD" ]]; then
  echo "usage: check-branch-flow.sh <base-branch> <head-branch>" >&2
  exit 2
fi

case "$BASE" in
  main)
    if [[ "$HEAD" != "dev" ]]; then
      echo "Invalid PR direction: only dev may be promoted to main (got $HEAD -> main)." >&2
      exit 1
    fi
    ;;
  dev)
    if [[ "$HEAD" == "dev" ]]; then
      echo "Invalid PR direction: dev cannot target itself." >&2
      exit 1
    fi
    ;;
  *)
    echo "Invalid PR base: use dev for feature work or main for production promotion." >&2
    exit 1
    ;;
esac

echo "Branch flow valid: $HEAD -> $BASE"
