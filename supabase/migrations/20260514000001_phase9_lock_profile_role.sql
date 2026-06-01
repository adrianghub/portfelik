-- Phase 9 - RLS regression suite found a self-elevation gap on profiles.role.
--
-- Background: migration 20260423000000 ended with
--   revoke update (role) on profiles from authenticated;
-- and 20260426000001 re-applied the same revoke after granting table-level
-- UPDATE on all public tables.
--
-- The column-level REVOKE is silently ineffective when a broader table-level
-- GRANT exists - PostgreSQL evaluates the wider grant first. Result: any
-- authenticated user could self-elevate to admin via
--   update profiles set role = 'admin' where id = auth.uid();
--
-- Fix: strip table-level UPDATE and re-grant per editable column EXCEPT role.
-- role remains writable only via assign_admin_role / revoke_admin_role
-- SECURITY DEFINER RPCs (which check is_admin() internally).

revoke update on profiles from authenticated;

grant update (email, name, last_login_at, settings, updated_at)
  on profiles
  to authenticated;
