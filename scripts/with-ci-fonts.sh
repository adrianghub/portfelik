#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" == Linux ]]; then
  FONTCONFIG_FILE="$(bash "$ROOT/scripts/configure-ci-fonts.sh")"
  export FONTCONFIG_FILE
fi
exec "$@"
