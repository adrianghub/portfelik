-- Grant service_role full CRUD on all current and future public tables.
--
-- Context: prior grant migrations (20260426000001, 20260516000001, 20260521000002)
-- restored authenticated-role access after initial-schema REVOKEs, but never
-- re-granted service_role. Server-side admin paths (seed-staging.mjs and any
-- future service-role automation) need direct table writes to bypass RLS.
-- Exposed first time when seed-staging hit a fresh portfelik-staging project
-- and got `permission denied for table transactions` on cleanup.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
