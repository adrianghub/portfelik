-- =============================================================================
-- Fix: restore table-level grants to authenticated role
--
-- The initial schema migration (20260423) was missing explicit GRANT statements
-- for SELECT/INSERT/UPDATE/DELETE on tables to the authenticated role. Supabase
-- auto-applies these on project creation, but they were lost when legacy JWT
-- API keys were disabled (platform reset implicit grants).
--
-- Without these grants, RLS policies cannot evaluate — every authenticated
-- request returns 403 regardless of policy content.
-- =============================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage, select
  on all sequences in schema public
  to authenticated;

-- Re-apply column-level security in case it was reset.
revoke update (role) on profiles from authenticated;
