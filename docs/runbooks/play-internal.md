# Play Internal AAB from GitHub Actions

Push to `main` deploys web automatically. After that workflow succeeds,
`.github/workflows/deploy-play-internal.yml` builds a signed Android App Bundle
and uploads it to the **Internal testing** track for `pl.jakstoimy.app`.

Local `apps/web-svelte/scripts/android-release.sh` remains a laptop fallback.
CI is the path testers should get after a production promotion.

## What CI does

1. `Deploy production` finishes (Cloudflare Pages + probe).
2. `Deploy Play Internal` checks out the same commit, rebuilds the Capacitor
   web assets against production `PUBLIC_*`, signs the AAB with the upload
   keystore, and calls the Play Android Publisher API (`track: internal`).
3. The AAB is also stored as a GitHub Actions artifact for 14 days.

Re-run without a web deploy: Actions → **Deploy Play Internal** → Run workflow.

Play still requires a **new `versionCode`** for every upload. Bump
`apps/web-svelte/android/app/build.gradle` in the PR that should reach testers.
Uploading the same `versionCode` twice is rejected by Play.

## One-time secrets (Production environment)

Add these on the **Production** GitHub environment (same place as
`PUBLIC_SUPABASE_URL`), not as repository-wide secrets unless you also grant
the workflow that environment.

| Secret | Value |
| --- | --- |
| `PLAY_SERVICE_ACCOUNT_JSON` | Full JSON key of a Play Console API service account |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | `base64 -w0 android/upload-keystore.jks` from the machine that holds the upload key |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` from `android/keystore.properties` |
| `ANDROID_KEY_ALIAS` | Usually `upload` (see `create-upload-keystore.sh`) |
| `ANDROID_KEY_PASSWORD` | `keyPassword` from `keystore.properties` |
| `PUBLIC_GOOGLE_WEB_CLIENT_ID` | Web OAuth client ID used by native Google Sign-In |

Also required (already used by web production deploy):
`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.

### Play API service account

1. In Google Cloud, create (or reuse) a project, enable **Google Play Android
   Developer API**.
2. Create a service account, download the JSON key. Store it only as
   `PLAY_SERVICE_ACCOUNT_JSON`.
3. In Play Console → Users and permissions, invite that service account email
   with permission to **release to testing tracks** for `pl.jakstoimy.app`.

The first-ever AAB for an app listing must be uploaded in the Play Console UI.
JakStoimy already has Internal builds, so later versions can go through the API.

### Upload keystore

Use the existing upload key (`android/upload-keystore.jks`), not a new one.
Play App Signing will reject a different upload certificate.

```bash
cd apps/web-svelte
base64 -w0 android/upload-keystore.jks
```

Paste the single line into `ANDROID_UPLOAD_KEYSTORE_BASE64`. Never commit the
`.jks` or `keystore.properties`.

## If the workflow fails

- **Missing secret** — the job lists the name. Add it on Production and re-run
  **Deploy Play Internal**.
- **Version code already used** — bump `versionCode` / `versionName` and
  promote `dev` → `main` again, or run the workflow after that commit is on
  `main`.
- **Service account 403** — the Play user invite is pending or lacks the
  testing-track permission.

Web production is independent: a Play failure does not roll back
`app.jakstoimy.pl`.
