#!/usr/bin/env bash
# Print a Fontconfig path for browser tests; no global font changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != Linux ]]; then
  printf '%s\n' "${FONTCONFIG_FILE:-}"
  exit 0
fi

if ! command -v fc-match >/dev/null ||
  [[ ! -f /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf ||
    ! -f /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf ||
    ! -f /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf ]]; then
  echo 'Browser snapshots require fontconfig and fonts-dejavu-core. Install these packages before running tests.' >&2
  exit 1
fi

runtime_dir="$(mktemp -d /tmp/jakstoimy-ci-fonts.XXXXXX)"
config="$runtime_dir/fonts.conf"
sed "s|@FONT_CACHE_DIR@|$runtime_dir/cache|g" "$ROOT/scripts/ci-fonts.conf" > "$config"
family="$(FONTCONFIG_FILE="$config" fc-match -f '%{family}' system-ui)"
bold="$(FONTCONFIG_FILE="$config" fc-match -f '%{style}' 'system-ui:weight=bold')"
if [[ "$family" != 'DejaVu Sans' || "$bold" != Bold ]]; then
  echo 'Browser font configuration failed: expected DejaVu Sans regular and bold.' >&2
  exit 1
fi

# Keep the config alive across GitHub Actions steps; the OS owns /tmp cleanup.
printf '%s\n' "$config"
