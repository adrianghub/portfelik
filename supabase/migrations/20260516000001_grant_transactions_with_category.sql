-- Restore SELECT grant on transactions_with_category to authenticated, anon,
-- service_role.
--
-- 20260516000000_transactions_group_id.sql did `drop view ... ; create view ...`
-- to refresh the column list (Postgres rejects `create or replace view` when
-- t.* expansion reorders columns). The drop wiped the SELECT grant originally
-- applied by 20260426000001_grant_authenticated_table_access.sql, causing
-- PostgREST queries from authenticated clients to return 403 Forbidden.
--
-- Surfaced by staging smoke: insert succeeded (201) but the post-mutation
-- refetch of the view returned 403, so the new row never appeared in the UI.

grant select on table transactions_with_category to authenticated, anon, service_role;
