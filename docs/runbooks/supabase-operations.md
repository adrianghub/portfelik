# Supabase operations

Use this runbook for local, staging, and production Supabase work from this
repository. The canonical entrypoint is the guarded dispatcher:

```bash
./scripts/supabase-ops.sh help
```

## Environment model

| Target     | Purpose                                  | Mutation policy                                              |
| ---------- | ---------------------------------------- | ------------------------------------------------------------ |
| `local`    | Laptop Supabase stack and generated types | Local reset is expected during migration verification.        |
| `staging`  | Dedicated `portfelik-staging` project     | Remote changes require `--confirm staging`.                  |
| `prod`     | Live production project                  | Preview first; remote changes require exact `--confirm prod`. |

Supabase CLI link state lives under ignored `supabase/.temp/` and
`supabase/.branches/`. It is per-machine state and must not be committed.

## Credentials

Copy `supabase/.env.example` to gitignored `supabase/.env` and keep manual
operation values there:

- `STAGING_SUPABASE_PROJECT_REF` and `STAGING_SUPABASE_DB_PASSWORD` link the
  staging project.
- `PROD_SUPABASE_PROJECT_REF` and `PROD_SUPABASE_DB_PASSWORD` link production.
- `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, and the staging
  demo/smoke user variables power the synthetic staging seed.

The dispatcher does not own Supabase API authentication. Log in with the
Supabase CLI profile you intend to use, or provide `SUPABASE_ACCESS_TOKEN`
outside the repo when a non-interactive environment needs it.

## Common operations

Local stack and schema replay:

```bash
./scripts/supabase-ops.sh local start
./scripts/supabase-ops.sh local status
./scripts/supabase-ops.sh local reset
./scripts/supabase-ops.sh local advisors
./scripts/supabase-ops.sh local types
./scripts/supabase-ops.sh local stop
```

Create a migration through the CLI so the timestamp and file layout stay
canonical:

```bash
./scripts/supabase-ops.sh migration new short_slug
```

Inspect and promote staging:

```bash
./scripts/supabase-ops.sh staging link
./scripts/supabase-ops.sh staging migrations
./scripts/supabase-ops.sh staging push-preview
./scripts/supabase-ops.sh staging push --confirm staging
./scripts/supabase-ops.sh staging functions --confirm staging
./scripts/supabase-ops.sh staging seed --confirm staging
./scripts/supabase-ops.sh staging advisors
```

Inspect and promote production only after staging verification:

```bash
./scripts/supabase-ops.sh prod link
./scripts/supabase-ops.sh prod migrations
./scripts/supabase-ops.sh prod push-preview
./scripts/supabase-ops.sh prod push --confirm prod
./scripts/supabase-ops.sh prod functions --confirm prod
./scripts/supabase-ops.sh prod advisors
```

## Promotion flow

1. Create one migration for one schema concern.
2. Reset the local stack, run local RLS/tests, refresh generated types when the
   database TypeScript surface changed, and run local advisors for schema/RLS
   work.
3. Let `dev` CI migrate/seed staging, or run the staging preview/apply/function
   sequence manually when debugging that path.
4. Verify Auth/PostgREST/RLS behavior on staging before production promotion.
5. Preview production, apply the reviewed migrations explicitly, and deploy
   Edge Functions only when the code changed.

`supabase/seed.sql` is the system seed shared by local reset and staging pushes.
Production push commands apply migrations only. `staging seed` adds synthetic
personas and fixture rows only for the configured staging users.

## Safety notes

- The dispatcher has no remote reset operation. Do not add one as a convenience
  wrapper for staging or production.
- SQL files under `supabase/migrations/` remain canonical. Never amend an
  applied migration.
- Before manually applying
  `20260524000000_environment_edge_function_urls.sql` to production, make sure
  production Vault has the production `edge_functions_base_url` when push/cron
  DB hook dispatch must stay active.
- Production user-cap enforcement is Vault-gated too. Set `max_user_cap` to a
  non-negative integer to cap new `auth.users` rows; leave it absent on local
  and staging when unrestricted persona churn is intended.
- Staging DB hooks intentionally no-op until staging Vault and Edge Function
  secrets are deliberately configured for real sends.
- If a linked operation appears to target the wrong environment, rerun the
  dispatcher with `staging link` or `prod link`; do not trust stale CLI state.
