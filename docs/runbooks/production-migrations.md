# Production migration workflow

`.github/workflows/production-migrations.yml` provides manual `preview` and
`apply` operations for production project `emqzcygfwcvbmhxhfkcc`. An AI agent can
dispatch and monitor these operations through GitHub Actions. The runner executes
`scripts/supabase-ops.sh`: `link → migrations → push-preview → push --confirm prod
→ migrations`. Preview stops before push. There is no seed, history repair,
Edge Function deployment, Pages deployment, merge, or branch promotion.

## One-time setup

- Publish the reviewed workflow and helper on the default branch before using
  `workflow_dispatch`. Preparing the files locally does not enable dispatch.
  A later workflow run may select protected `main` or `dev` as its workflow ref;
  the candidate is a separate full commit SHA.
- Configure GitHub environment `Production` with the existing secrets
  `PROD_SUPABASE_ACCESS_TOKEN`, `PROD_SUPABASE_DB_PASSWORD`, and
  `PROD_SUPABASE_PROJECT_REF`. The ref must equal the pinned production project.
  Use a valid Supabase access token scoped to this project where supported.
- Configure required reviewers and deployment branch restrictions for
  `Production`, permitting only the reviewed workflow branches `main` and `dev`.
  GitHub enforces any configured environment approval before the job starts,
  including preview jobs. The workflow cannot configure these rules itself.
- Verify that the chosen GitHub-hosted runner can reach the Supabase pooler on
  TCP port 5432 and that Supabase Network Restrictions permit its source address.
  If fixed egress is required, use an appropriately secured runner with fixed
  egress and update `runs-on` through review. HTTP API access alone is insufficient.
- Give the agent's GitHub identity permission to dispatch Actions and read runs
  and artifacts. Production credentials stay in environment secrets. Do not send
  them in chat or workflow inputs.

## Preview and approve

Use the full 40-character candidate commit SHA. Do not use a moving branch name
or abbreviated SHA. The commit must be available in this repository's fetched
history. The workflow checks out its own trusted ref and extracts only canonical
SQL migration blobs from the candidate; candidate scripts, hooks, environment
files, and Supabase configuration are never executed or loaded. The trusted
workflow ref supplies configuration and the dispatcher.

```bash
gh workflow run production-migrations.yml --ref main \
  -f operation=preview \
  -f candidate_sha=FULL_40_CHARACTER_SHA
gh run list --workflow production-migrations.yml --limit 5
gh run watch RUN_ID --exit-status
gh run download RUN_ID --dir /tmp/jakstoimy-migration-preview
```

Inspect the run summary and `manifest.json` artifact. It contains the project,
candidate SHA, trusted config hash, every migration filename and SQL content hash,
and the exact pending versions. `result.json` and the summary contain the
`approval_sha256` digest. Compare the pending set with the reviewed migrations
and verify staging validation before approving it. Approval covers the exact
candidate, SQL contents, configuration, and pending set, not only a migration count.

## Apply

Confirm a restorable production backup and retain its reference and timestamp.
The workflow records the supplied reference; it does not create a backup or
independently verify restorability. A prior backup confirmation belongs to that
operation and must not be silently reused for future migration batches.

After the user authorizes the exact manifest, the agent can dispatch:

```bash
gh workflow run production-migrations.yml --ref main \
  -f operation=apply \
  -f candidate_sha=FULL_40_CHARACTER_SHA \
  -f approved_manifest_sha256=DIGEST_FROM_APPROVED_PREVIEW \
  -f backup_reference='Backup identifier and confirmation time'
```

Use the same trusted workflow ref/version as preview. Apply repeats link, history,
and dry run, then recomputes the manifest before any push. A changed SQL file,
candidate, trusted config, or pending set invalidates approval. Drift, remote-only
versions, duplicate timestamps, historical gaps, an unrecognized history table,
or a preview that differs from history stop the operation. No timestamps are
renamed and no automatic history repair is attempted.

The `deploy-production` concurrency group also serializes this workflow with
the production deployment workflow. Manual CLI sessions and other workflows must
not mutate production concurrently; GitHub concurrency cannot lock external
clients. Avoid submitting multiple queued production operations at once because
GitHub may replace an older pending run in a concurrency group.

## Completion and failures

Wait for completion, inspect `result.json`, and report the candidate, migration
versions, backup reference, run URL, and final status. Success requires
`applied-and-verified` and exact local/remote migration-history parity. This
checks application history; perform any migration-specific read-only checks
identified during review separately. Summary and JSON artifacts are retained
for 30 days; preserve approval records longer if required.

On failure or cancellation, inspect the actual database history before retrying.
Some migrations may already have committed. Do not retry blindly, automatically
roll back, mark migrations applied, or change canonical SQL files. Generate a new
preview for the remaining set, investigate the failure, and obtain authorization
for any revised operation. When push errors before the final history check,
run `prod migrations` separately to establish the current state.

To test the orchestration locally without production access:

```bash
node --test scripts/production-migrations.test.mjs scripts/supabase-ops.test.mjs
```

The tests use temporary repositories and a fake CLI; they never connect to Supabase.
