#!/usr/bin/env bash
# Tag the current commit and publish a GitHub Release when package.json
# names a version that does not already have a tag. Existing tags stay put.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

node scripts/check-release-version.mjs

version="$(node -p "require('./apps/web-svelte/package.json').version")"
tag="v${version}"

git fetch --tags --force
if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "Tag ${tag} already exists. No new GitHub release."
  exit 0
fi

notes="$(mktemp)"
node scripts/print-release-notes.mjs >"$notes"
gh release create "$tag" \
  --target "${GITHUB_SHA:-HEAD}" \
  --title "$tag" \
  --notes-file "$notes"
echo "Published ${tag}"
