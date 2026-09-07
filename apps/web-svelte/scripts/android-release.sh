#!/usr/bin/env bash
# Build Capacitor Android release artifacts against production PUBLIC_* env.
# Reads apps/web-svelte/.env.cloud.local (gitignored). Never prints secret values.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.cloud.local ]]; then
  echo "Missing .env.cloud.local with PUBLIC_SUPABASE_URL / ANON_KEY / VAPID_KEY" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source <(grep -E '^PUBLIC_' .env.cloud.local)
set +a

if [[ ! "${PUBLIC_SUPABASE_URL:-}" =~ ^https://.+supabase\.co ]]; then
  echo "PUBLIC_SUPABASE_URL must be an https://…supabase.co URL" >&2
  exit 1
fi

if [[ -z "${PUBLIC_SUPABASE_ANON_KEY:-}" || -z "${PUBLIC_VAPID_KEY:-}" ]]; then
  echo "PUBLIC_SUPABASE_ANON_KEY and PUBLIC_VAPID_KEY are required" >&2
  exit 1
fi

echo "Building web + Android release for production Supabase host…"
pnpm exec vite build --mode production
pnpm exec cap sync android

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/Cellar/openjdk@21/21.0.8/libexec/openjdk.jdk/Contents/Home}"
cd android
./gradlew assembleRelease bundleRelease --no-daemon
echo "APK: android/app/build/outputs/apk/release/app-release.apk"
echo "AAB: android/app/build/outputs/bundle/release/app-release.aab"
