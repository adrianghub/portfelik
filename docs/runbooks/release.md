# Release

Production is `main`. A GitHub Release and git tag are created only there, and
only when the version is new.

## What to change

In the same commit:

1. Add the new version at the top of
   `apps/web-svelte/src/lib/content/changelog.json`.
2. Set the same version in `apps/web-svelte/package.json`.

The version is `MAJOR.MINOR.PATCH`. The newest changelog entry is the current
version. Older entries stay in the file. Do not rewrite a version that already
has a tag.

`scripts/check-release-version.mjs` fails CI when those two disagree, a date is
not `YYYY-MM-DD`, or the list is not newest-first.

## What `main` does

`.github/workflows/release.yml` runs on every push to `main`.

- It reads `apps/web-svelte/package.json`.
- If tag `vX.Y.Z` already exists, it stops. The tag is not moved.
- Otherwise it creates that tag on the pushed commit and a GitHub Release
  whose notes come from the matching changelog entry.

Staging (`dev`) does not get a tag. The deployed app shows the version from
the changelog and, on CI builds, the short git SHA as the build.

## Check locally

```bash
node scripts/check-release-version.mjs
node scripts/print-release-notes.mjs
```
