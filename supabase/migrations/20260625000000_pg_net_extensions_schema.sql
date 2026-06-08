-- Supabase advisor 0014 flags pg_net when its extension record lives in public.
--
-- Hosted Supabase does NOT support:
--   ALTER EXTENSION pg_net SET SCHEMA extensions;  -- SQLSTATE 0A000
--
-- Remediation on cloud: disable + re-enable pg_net in Dashboard → Database →
-- Extensions (net.http_post() callers stay on the net schema either way).
-- Local CLI installs pg_net into extensions by default; nothing to do here.

select 1;
