-- Allow invited users through the production Auth signup cap while keeping
-- non-invited first-time OAuth accounts blocked once the cap is reached.
--
-- Operational pattern for private production:
--   1. Set Vault `max_user_cap` to the current auth.users count.
--   2. Enable Google signups in Supabase Auth.
--   3. Pending group invitations become the allow-list for new accounts.

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
  v_has_pending_invitation boolean;
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

  -- Invited and non-invited signups share one lock boundary, so a
  -- non-invited count check cannot race an invited insert commit.
  perform pg_advisory_xact_lock(hashtext('max_user_cap'));

  select exists (
    select 1
    from public.group_invitations gi
    where gi.status = 'pending'
      and lower(gi.invited_user_email) = lower(new.email)
  )
  into v_has_pending_invitation;

  if v_has_pending_invitation then
    return new;
  end if;

  select count(*) into v_count from auth.users;

  if v_count >= v_cap then
    raise exception 'max_user_cap_reached: account creation blocked (cap=%, current=%)', v_cap, v_count
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_max_user_cap() from public;
