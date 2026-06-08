# Supabase - Claude guidance

Loaded automatically when working in `supabase/`.

## Schema rules

- **One migration file per logical change.** Never amend applied migrations.
- **`LANGUAGE SQL` functions** validate table references at parse time - must be defined _after_ tables they query. `LANGUAGE plpgsql` is exempt.
- **Money:** `numeric(12,2)`, positive magnitude. `type` enum (`income`/`expense`) carries sign.
- **System categories:** `user_id IS NULL` - visible to all via RLS. Seeded in `seed.sql`.
- **Soft deletes:** none. Hard deletes everywhere.
- **Supabase Data API grants:** Supabase's 2026-05-30 / 2026-10-30 rollout stops auto-exposing new `public` tables to PostgREST, GraphQL, and `supabase-js`. Any migration that creates a `public` table, sequence, or Data-API-facing view must include explicit, narrow `GRANT` statements next to the RLS policies so `supabase db reset` replays them locally. Existing prod/staging tables keep current grants; the risk is future migrations without grants. Source: https://github.com/orgs/supabase/discussions/45329

## RLS patterns

Group-shared visibility pattern (used on transactions, categories, and
plan/list compatibility tables):

```sql
user_id = (select auth.uid())
or exists (
  select 1 from group_members gm1
  join group_members gm2 on gm1.group_id = gm2.group_id
  where gm1.user_id = (select auth.uid())
    and gm2.user_id = <table>.user_id
)
```

Always wrap `auth.uid()` in `(select auth.uid())` - initPlan optimisation, evaluates once per statement not per row.

Admin check: `is_admin()` SECURITY DEFINER reads `profiles.role`. Role column is `REVOKE UPDATE ... FROM authenticated` - change only via `assign_admin_role` / `revoke_admin_role` RPCs.

Group writes: ALL via SECURITY DEFINER RPCs. Direct writes to `user_groups`, `group_members`, `group_invitations` blocked by `using (false)`.

## MCP privilege limits

- `ALTER DATABASE SET` blocked - use `apply_migration` for privileged DDL
- Secrets: use Vault (`vault.create_secret`) - no superuser needed
- Vault pattern: `select decrypted_secret into v from vault.decrypted_secrets where name = '<name>'`
- DB hooks call Edge Functions through Vault-configured `edge_functions_base_url`
  after migration `20260524000000_environment_edge_function_urls.sql`. Keep the
  production Vault URL pointed at the production function host. Staging should
  omit `edge_functions_base_url` and `internal_trigger_secret` until real
  staging push/cron dispatch is intentionally enabled.

## Operations

Use the guarded repo dispatcher from the repo root for ordinary local, staging,
and production work:

```bash
./scripts/supabase-ops.sh help
```

The command reference and promotion flow live in
`docs/runbooks/supabase-operations.md`. Remote mutations require an explicit
target confirmation. Supabase CLI link state under `.temp/` and `.branches/` is
ignored per-machine state, not project truth.

## Migration file locations

- `migrations/20260423000000_initial_schema.sql` - main schema (tables, RLS, RPCs, triggers)
- `migrations/20260425000000_phase5_notifications_push.sql` - notifications + push_subscriptions tables, `mark_notification_read`, `mark_all_notifications_read`, `process_recurring_transactions`, pg_cron jobs
- `migrations/20260425000001_phase5_2_edge_function_hooks.sql` - DB triggers → Edge Function calls (Vault-based)
- `migrations/20260426000000_fix_recurring_template_id.sql` - added `recurring_template_id` FK for dedup

## Scheduled jobs (pg_cron)

All cron expressions are evaluated in **UTC**. Europe/Warsaw is UTC+1 in winter (CET, late Oct – late Mar) and UTC+2 in summer (CEST). For each job the table shows the UTC schedule and the resulting local fire window.

| Job                              | UTC schedule                           | Local (winter / summer)            | Source migration                                      |
| -------------------------------- | -------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `process-recurring-transactions` | `0 23 1 * *` (23:00 UTC, 1st of month) | 00:00 CET (2nd) / 01:00 CEST (2nd) | `20260425000000_phase5_notifications_push.sql:455`    |
| `update-transaction-statuses`    | `0 5 * * *` (05:00 UTC daily)          | 06:00 CET / 07:00 CEST             | `20260425000000_phase5_notifications_push.sql:461`    |
| `send-admin-summary`             | `0 7 * * *` (07:00 UTC daily)          | 08:00 CET / 09:00 CEST             | `20260630000000_weekly_summary_daily_schedule.sql` (sends on Warsaw Mon or day after import reminder) |

If exact local-time firing becomes important (e.g. always 09:00 Warsaw regardless of DST), switch to `cron.schedule_in_database(...)` with a timezone argument - this requires the `pg_cron.timezone` GUC set per database.

The 1-hour DST drift is acceptable for these jobs (none are user-facing in a sub-hour way). On-call: if a Sunday morning incident reports "the recurring transaction job fired an hour earlier/later than usual," check DST transition dates rather than chasing scheduler bugs.

## Migration tracking

Production `supabase_migrations.schema_migrations` was built partly through
Supabase MCP applies before CLI promotion became the normal path. Some tracked
production versions can therefore differ from the canonical local migration
timestamps, and older applied SQL files can still need history repair.

**SQL files in `supabase/migrations/` are canonical.** Do not manually edit the
history table. Inspect the linked target first, then repair only a local
migration timestamp that is already applied to that database but missing from
history:

```bash
./scripts/supabase-ops.sh prod migrations
./scripts/supabase-ops.sh prod push-preview
./scripts/supabase-ops.sh prod repair-applied 20260423000000 --confirm prod
```

If `push-preview` still reports a migration after history repair, treat it as a
real unapplied migration until inspection proves otherwise.

Edge Functions have per-function `deno.json` files (added 2026-05-13) pinning import versions for `@supabase/supabase-js`, the edge runtime types, and `web-push` (send-push only). Do not remove these - they prevent silent registry-side version drift on `supabase functions deploy`.

## Cloud environment split

- Local schema resets still replay every file in `supabase/migrations/` plus the
  idempotent system `seed.sql`.
- `dev` GitHub Actions applies committed migrations and `seed.sql` to the
  dedicated `portfelik-staging` project before Cloudflare Pages staging deploy.
- Local and staging persona seeding lives in
  `apps/web-svelte/scripts/seed-personas.mjs`. Run local personas after a reset
  with `./scripts/supabase-ops.sh local seed` or `pnpm seed:local` from
  `apps/web-svelte/`. CI runs `pnpm seed:staging`; it also creates manual
  `admin@portfelik.test` / `user@portfelik.test` personas with password equal to
  login.
- Production migrations stay manual/gated. Do not point `supabase db push`
  automation at production until the early migration-history drift has been
  deliberately normalized.
- Synthetic staging fixtures live in
  `apps/web-svelte/scripts/seed-staging.mjs`; they delete only `Demo:` rows
  owned by the configured staging demo user.
