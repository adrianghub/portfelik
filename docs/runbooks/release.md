# Release

The version people see is the Play version name. The same number is on the
changelog page, in the web app, and on the AAB.

## What to change

In the same commit:

1. Add the version at the top of
   `apps/web-svelte/src/lib/content/changelog.json`, with a new `versionCode`.
2. Set that `versionName` and `versionCode` in
   `apps/web-svelte/android/app/build.gradle`.
3. Set the same version name in `apps/web-svelte/package.json`.

Play rejects an upload that reuses a version code. The last internal bundle is
1.1.2. This release is 1.2.0, code 6.

`scripts/check-release-version.mjs` fails CI when those three disagree.

## What `main` does

`.github/workflows/release.yml` tags `vX.Y.Z` and opens a GitHub Release when
that tag does not exist. The notes are the changelog entry, including the
Play version code.

`.github/workflows/deploy-play-internal.yml` uploads the AAB from the same
`versionName` and `versionCode`. Staging does not get a tag.

## Check locally

```bash
node scripts/check-release-version.mjs
node scripts/print-release-notes.mjs
```
