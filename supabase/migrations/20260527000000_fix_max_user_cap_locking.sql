-- Follow-up to 20260526000000_enforce_max_user_cap.sql, addressing review
-- findings:
--
-- 1. The original trigger called `lock table auth.users in share row exclusive
--    mode` from a BEFORE INSERT trigger. INSERT already holds ROW EXCLUSIVE on
--    auth.users, so each concurrent first-time OAuth sign-in had to upgrade
--    its own row-exclusive lock to share-row-exclusive. Two concurrent
--    sign-ins could deadlock: each insert transaction holds ROW EXCLUSIVE and
--    then waits on the stronger lock, with no consistent acquire order.
--    Failed auth.users triggers also block sign-ups, so the symptom for a
--    legitimate sign-up would be a confusing "Database error" while the cap
--    still had room.
--
--    Switch to `pg_advisory_xact_lock(hashtext('max_user_cap'))` - a
--    transaction-scoped advisory lock with a fixed key. It does not interact
--    with INSERT's row-level locking, serializes the count-vs-cap check
--    across concurrent sign-ups, and releases automatically at transaction
--    end (commit or rollback).
--
-- 2. A present but unparseable Vault value (e.g. typo) previously fell back
--    to "no cap" silently. A negative value did the same. That turns
--    production protection off without any visible failure. Tighten both:
--    invalid integer or negative cap raises an explicit configuration
--    error. Missing key still no-ops, since that is how staging and local
--    intentionally disable the cap.

create or replace function public.enforce_max_user_cap()
returns trigger
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_cap_text text;
  v_cap int;
  v_count int;
begin
  select decrypted_secret into v_cap_text
  from vault.decrypted_secrets
  where name = 'max_user_cap'
  limit 1;

  if v_cap_text is null then
    return new;
  end if;

  begin
    v_cap := v_cap_text::int;
  exception when others then
    raise exception 'max_user_cap_invalid: vault value % is not an integer', v_cap_text
      using errcode = 'invalid_parameter_value';
  end;

  if v_cap < 0 then
    raise exception 'max_user_cap_negative: vault value % must be non-negative (omit the secret to disable the cap)', v_cap
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtext('max_user_cap'));

  select count(*) into v_count from auth.users;

  if v_count >= v_cap then
    raise exception 'max_user_cap_reached: account creation blocked (cap=%, current=%)', v_cap, v_count
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_max_user_cap() from public;
