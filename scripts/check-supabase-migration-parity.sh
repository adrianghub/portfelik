#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---linked}"

case "$MODE" in
  --linked | --local) ;;
  *)
    printf 'Usage: %s [--linked|--local]\n' "$0" >&2
    exit 2
    ;;
esac

output="$(supabase migration list "$MODE" --workdir "$ROOT_DIR" 2>&1)" || {
  printf '%s\n' "$output" >&2
  exit 1
}
printf '%s\n' "$output"

set +e
parity_report="$(
  printf '%s\n' "$output" | awk -F '|' '
    function trim(value) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      return value
    }

    {
      local_version = trim($1)
      remote_version = trim($2)
      if (local_version ~ /^[0-9]{14}$/ || remote_version ~ /^[0-9]{14}$/) {
        found = 1
        if (local_version != remote_version) {
          mismatched = 1
          printf "local=%s remote=%s\n", \
            (local_version == "" ? "<missing>" : local_version), \
            (remote_version == "" ? "<missing>" : remote_version)
        }
      }
    }

    END {
      if (!found) exit 2
      if (mismatched) exit 1
    }
  '
)"
parity_status=$?
set -e

case "$parity_status" in
  0)
    printf 'Supabase migration history is in parity.\n'
    ;;
  1)
    printf 'Supabase migration history mismatch:\n%s\n' "$parity_report" >&2
    exit 1
    ;;
  *)
    printf 'Could not parse Supabase migration history output.\n' >&2
    exit 1
    ;;
esac
