-- =============================================================================
-- Phase 5.2 — Edge Function wiring
--
-- Connects DB events to deployed Edge Functions via pg_net.http_post:
--   * after insert on notifications → send-push  (web-push fan-out)
--   * after update of role on profiles → sync-user-role  (mirrors role to JWT)
--   * pg_cron weekly → send-admin-summary
--
-- Auth: service_role JWT stored in Supabase Vault (not a GUC).
-- Insert once after deploy (generate with: openssl rand -hex 32):
--
--   select vault.create_secret('<random-hex>', 'internal_trigger_secret');
--
-- Same value must be set as Edge Function secret INTERNAL_TRIGGER_SECRET.
-- Until the secret exists, triggers no-op gracefully.
-- functions_url is hardcoded (project-specific, not a secret).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Helper: read a GUC, return NULL if unset (kept for backward compat; no longer
-- used by trigger functions below which now read from vault directly)
-- -----------------------------------------------------------------------------
create or replace function _setting(p_name text)
returns text
language sql
stable
as $$
  select nullif(current_setting(p_name, true), '');
$$;


-- -----------------------------------------------------------------------------
-- Trigger: notifications.insert → send-push
-- -----------------------------------------------------------------------------
create or replace function trigger_send_push()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url constant text := 'https://emqzcygfwcvbmhxhfkcc.supabase.co/functions/v1';
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('notificationId', new.id)
  );

  return new;
end;
$$;

create trigger notifications_send_push
  after insert on notifications
  for each row execute function trigger_send_push();


-- -----------------------------------------------------------------------------
-- Trigger: profiles.role update → sync-user-role
-- -----------------------------------------------------------------------------
create or replace function trigger_sync_user_role()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url constant text := 'https://emqzcygfwcvbmhxhfkcc.supabase.co/functions/v1';
  v_key text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/sync-user-role',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('userId', new.id, 'role', new.role::text)
  );

  return new;
end;
$$;

create trigger profiles_role_change_sync
  after update of role on profiles
  for each row execute function trigger_sync_user_role();


-- -----------------------------------------------------------------------------
-- pg_cron: weekly send-admin-summary (Mon 07:00 UTC = 08:00/09:00 Warsaw)
-- -----------------------------------------------------------------------------
create or replace function trigger_send_admin_summary()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url constant text := 'https://emqzcygfwcvbmhxhfkcc.supabase.co/functions/v1';
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_key is null then
    raise notice 'send-admin-summary skipped: internal_trigger_secret not in vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/send-admin-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

select cron.schedule(
  'send-admin-summary',
  '0 7 * * 1',
  $$ select public.trigger_send_admin_summary(); $$
);
