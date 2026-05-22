-- Cap the number of auth.users via a Vault-gated BEFORE INSERT trigger.
--
-- Purpose: prevent accidental spam sign-ups on production. Anyone with a Google
-- account can otherwise complete OAuth and auto-create an auth.users row. We
-- already disabled email/password sign-up; this is the second line of defense.
--
-- Env scoping mirrors edge_functions_base_url:
--   * production: set vault.create_secret('2', 'max_user_cap') → trigger fires
--   * staging / local: omit the Vault key → trigger no-ops, sign-ups unrestricted
--
-- To raise/remove the cap, update the Vault value via vault.update_secret(...)
-- or delete the row from vault.secrets.

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
    return new;
  end;

  if v_cap < 0 then
    return new;
  end if;

  lock table auth.users in share row exclusive mode;
  select count(*) into v_count from auth.users;

  if v_count >= v_cap then
    raise exception 'max_user_cap_reached: account creation blocked (cap=%, current=%)', v_cap, v_count
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_max_user_cap() from public;

drop trigger if exists enforce_max_user_cap_trigger on auth.users;

create trigger enforce_max_user_cap_trigger
  before insert on auth.users
  for each row execute function public.enforce_max_user_cap();
