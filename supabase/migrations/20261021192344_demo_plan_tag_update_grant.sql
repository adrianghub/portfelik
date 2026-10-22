-- Plans intentionally use column-level UPDATE grants: id/user_id stay immutable.
-- The showcase tag was added after that allowlist and omitted from its grants.
-- Existing UPDATE USING/WITH CHECK and group-owner triggers remain authoritative.
grant update (is_demo) on table public.plans to authenticated;
