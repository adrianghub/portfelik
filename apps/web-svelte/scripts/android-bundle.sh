#!/usr/bin/env bash
# Build a signed Play AAB. Expects PUBLIC_* in the environment and
# android/keystore.properties present (local file or CI-generated).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${PUBLIC_SUPABASE_URL:-}" || -z "${PUBLIC_SUPABASE_ANON_KEY:-}" || -z "${PUBLIC_VAPID_KEY:-}" ]]; then
  echo "PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, and PUBLIC_VAPID_KEY must be set" >&2
  exit 1
fi

if [[ -z "${PUBLIC_GOOGLE_WEB_CLIENT_ID:-}" ]]; then
  echo "PUBLIC_GOOGLE_WEB_CLIENT_ID is required (Google Cloud Web client ID, not the Android client)" >&2
  exit 1
fi

if [[ ! -f android/keystore.properties ]]; then
  echo "Missing android/keystore.properties (local: android/create-upload-keystore.sh; CI writes it from secrets)" >&2
  exit 1
fi

echo "Building web + Android bundle for host ${PUBLIC_SUPABASE_URL#https://}"
pnpm exec vite build --mode production
pnpm exec cap sync android

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/Cellar/openjdk@21 ]]; then
  JAVA_HOME="$(echo /opt/homebrew/Cellar/openjdk@21/*/libexec/openjdk.jdk/Contents/Home | awk '{print $1}')"
  export JAVA_HOME
fi

cd android
chmod +x gradlew
./gradlew bundleRelease --no-daemon
echo "AAB: android/app/build/outputs/bundle/release/app-release.aab"
