-- Security advisor hardening (2026-06-23)
--
-- Closes prod/staging WARN findings:
--   * function_search_path_mutable on privacy masking helpers
--   * anon EXECUTE on internal seed_default_categories* (created after 20260529 blanket revoke)
--   * complete_shopping_list drift on envs that have not yet applied 20260617000000
--
-- Idempotent: ALTER FUNCTION SET, REVOKE, and DROP IF EXISTS are repeatable.

-- 1. Pin search_path on privacy masking helpers (SECURITY INVOKER SQL functions).
alter function public.privacy_amount_bucket(numeric) set search_path = public, pg_temp;
alter function public.privacy_mask_email(text) set search_path = public, pg_temp;
alter function public.privacy_mask_text(text) set search_path = public, pg_temp;

-- 2. Internal-only seed RPCs - not client-callable via PostgREST /rpc/.
-- Profile-insert trigger and SECURITY DEFINER callers do not need session EXECUTE.
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.seed_default_categories_on_profile() from public, anon, authenticated;

comment on function public.seed_default_categories(uuid) is
  'Internal: per-user default category seed. Callable from triggers and definer RPCs only.';

-- 3. Legacy shopping-list RPC (idempotent cleanup; primary drop is 20260617000000).
drop function if exists public.complete_shopping_list(uuid, numeric, uuid);
drop function if exists public.complete_shopping_list(uuid, numeric, uuid, boolean);
