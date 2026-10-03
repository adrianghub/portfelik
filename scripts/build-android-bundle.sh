#!/usr/bin/env bash
# Retry dependency downloads only; compiler, signing and version errors fail immediately.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web-svelte/android"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
for attempt in 1 2 3; do
  if bash ./gradlew bundleRelease --no-daemon 2>&1 | tee "$log"; then
    bash "$ROOT/scripts/verify-android-bundle.sh" "$PWD/app/build/outputs/bundle/release/app-release.aab"
    exit 0
  else
    status=${PIPESTATUS[0]}
  fi
  if [[ "$attempt" -eq 3 ]] || ! grep -Eq 'Could not (find|GET|HEAD) |Read timed out|Connection reset|Temporary failure in name resolution' "$log"; then
    exit "$status"
  fi
  echo "Dependency download failed; retrying Gradle ($attempt/3)."
  sleep 10
done
