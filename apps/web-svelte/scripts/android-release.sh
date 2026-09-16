#!/usr/bin/env bash
# Local production Android bundle. CI uses the same android-bundle.sh after
# writing keystore.properties from GitHub secrets (see docs/runbooks/play-internal.md).
# Usage: android-release.sh [--sync-only]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SYNC_ONLY=0
if [[ "${1:-}" == "--sync-only" ]]; then
  SYNC_ONLY=1
elif [[ $# -gt 0 ]]; then
  echo "usage: android-release.sh [--sync-only]" >&2
  exit 2
fi

if [[ ! -f .env.cloud.local ]]; then
  echo "Missing .env.cloud.local with PUBLIC_SUPABASE_URL / ANON_KEY / VAPID_KEY" >&2
  exit 1
fi

# Ignore any pre-exported PUBLIC_* from the shell / direnv / .env.local.
unset PUBLIC_SUPABASE_URL PUBLIC_SUPABASE_ANON_KEY PUBLIC_VAPID_KEY PUBLIC_PLAUSIBLE_DOMAIN PUBLIC_GOOGLE_WEB_CLIENT_ID || true

# Load PUBLIC_* safely: strip UTF-8 BOM + CRLF, ignore blank/comment lines,
# trim surrounding whitespace/quotes so local editors do not break the check.
loaded_keys=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line#$'\xEF\xBB\xBF'}"
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" == PUBLIC_*=* ]] || continue
  key="${line%%=*}"
  val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ ${#val} -ge 2 ]]; then
    first="${val:0:1}"
    last="${val: -1}"
    if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
      val="${val:1:${#val}-2}"
    fi
  fi
  printf -v "$key" '%s' "$val"
  export "$key"
  loaded_keys=$((loaded_keys + 1))
done < .env.cloud.local

if [[ "$loaded_keys" -eq 0 ]]; then
  echo "No PUBLIC_* keys loaded from $(pwd)/.env.cloud.local" >&2
  exit 1
fi

if [[ -z "${PUBLIC_SUPABASE_URL:-}" ]]; then
  echo "PUBLIC_SUPABASE_URL is empty after reading .env.cloud.local (${loaded_keys} PUBLIC_* keys loaded)" >&2
  echo "Check the file has a line: PUBLIC_SUPABASE_URL=https://….supabase.co" >&2
  exit 1
fi

if [[ ! "${PUBLIC_SUPABASE_URL}" =~ ^https://[A-Za-z0-9.-]+\.supabase\.co/?$ ]]; then
  # Show only host shape — never the full secret-bearing file.
  host="${PUBLIC_SUPABASE_URL#https://}"
  host="${host%%/*}"
  echo "PUBLIC_SUPABASE_URL must be an https://….supabase.co URL (got host: ${host:-<unparseable>}, len=${#PUBLIC_SUPABASE_URL})" >&2
  exit 1
fi

if [[ -z "${PUBLIC_SUPABASE_ANON_KEY:-}" || -z "${PUBLIC_VAPID_KEY:-}" ]]; then
  echo "PUBLIC_SUPABASE_ANON_KEY and PUBLIC_VAPID_KEY are required in .env.cloud.local" >&2
  exit 1
fi

if [[ -z "${PUBLIC_GOOGLE_WEB_CLIENT_ID:-}" ]]; then
  echo "PUBLIC_GOOGLE_WEB_CLIENT_ID is required in .env.cloud.local (Google Cloud Web client ID, not the Android client)" >&2
  exit 1
fi

if [[ "$SYNC_ONLY" -eq 1 ]]; then
  echo "Building web assets and syncing into android/…"
  pnpm exec vite build --mode production
  pnpm exec cap sync android
  echo "Synced production web assets into android/. Install with: cd android && ./gradlew installDebug"
  exit 0
fi

exec bash "$ROOT/scripts/android-bundle.sh"
