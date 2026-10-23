#!/usr/bin/env bash
set -euo pipefail

event="${1:-}"
branch="${2:-}"
sha="${3:-}"
expected="${4:-}"
operation="${5:-}"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid staging source SHA' >&2; exit 1; }
case "$event" in
  push)
    [[ "$branch" == dev ]] || { echo 'Staging push must target dev' >&2; exit 1; }
    ;;
  workflow_dispatch)
    [[ "$branch" == dev || "$branch" == codex/jakstoimy-1-4-demo-ui ||
       ( "$branch" == codex/jakstoimy-1-4-auth-demo && "$operation" == frontend ) ]] || {
      echo 'Manual staging requires an approved candidate; Auth is frontend-only' >&2; exit 1;
    }
    [[ "$expected" == "$sha" ]] || { echo 'Staging source differs from expected SHA' >&2; exit 1; }
    ;;
  *) echo 'Unsupported staging event' >&2; exit 1 ;;
esac
