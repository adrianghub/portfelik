# Supabase — Claude guidance

Loaded automatically when working in `supabase/`.

## Schema rules

- **One migration file per logical change.** Never amend applied migrations.
- **`LANGUAGE SQL` functions** validate table references at parse time — must be defined *after* tables they query. `LANGUAGE plpgsql` is exempt.
- **Money:** `numeric(12,2)`, positive magnitude. `type` enum (`income`/`expense`) carries sign.
- **System categories:** `user_id IS NULL` — visible to all via RLS. Seeded in `seed.sql`.
- **Soft deletes:** none. Hard deletes everywhere.

## RLS patterns

Group-shared visibility pattern (used on transactions, categories, shopping lists):
```sql
user_id = (select auth.uid())
or exists (
  select 1 from group_members gm1
  join group_members gm2 on gm1.group_id = gm2.group_id
  where gm1.user_id = (select auth.uid())
    and gm2.user_id = <table>.user_id
)
```

Always wrap `auth.uid()` in `(select auth.uid())` — initPlan optimisation, evaluates once per statement not per row.

Admin check: `is_admin()` SECURITY DEFINER reads `profiles.role`. Role column is `REVOKE UPDATE ... FROM authenticated` — change only via `assign_admin_role` / `revoke_admin_role` RPCs.

Group writes: ALL via SECURITY DEFINER RPCs. Direct writes to `user_groups`, `group_members`, `group_invitations` blocked by `using (false)`.

## MCP privilege limits

- `ALTER DATABASE SET` blocked — use `apply_migration` for privileged DDL
- Secrets: use Vault (`vault.create_secret`) — no superuser needed
- Vault pattern: `select decrypted_secret into v from vault.decrypted_secrets where name = '<name>'`

## Dev commands (from repo root)

```bash
supabase start         # start local stack + apply migrations + seed
supabase stop
supabase db reset      # wipe + replay (containers must be running)
supabase status        # get local URLs + anon key
supabase gen types typescript --local > apps/web-svelte/src/lib/supabase.types.ts
```

## Migration file locations

- `migrations/20260423000000_initial_schema.sql` — main schema (tables, RLS, RPCs, triggers)
- `migrations/20260425000000_phase5_notifications_push.sql` — notifications + push_subscriptions tables, `mark_notification_read`, `mark_all_notifications_read`, `process_recurring_transactions`, pg_cron jobs
- `migrations/20260425000001_phase5_2_edge_function_hooks.sql` — DB triggers → Edge Function calls (Vault-based)
- `migrations/20260426000000_fix_recurring_template_id.sql` — added `recurring_template_id` FK for dedup
