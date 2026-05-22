-- DB-to-Edge-Function calls must be environment-configured.
--
-- The original hook migrations embedded the production project ref in URL
-- literals. That is unsafe once staging has its own Supabase project: a staging
-- trigger must never POST to production Edge Functions.
--
-- Configure each cloud environment explicitly after this migration:
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1',
--     'edge_functions_base_url'
--   );
--
-- Staging intentionally omits edge_functions_base_url and
-- internal_trigger_secret initially. Hooks then no-op instead of sending push
-- traffic. Production should set both before applying this migration if push
-- dispatch must remain uninterrupted.

create or replace function edge_functions_base_url()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select nullif(decrypted_secret, '')
  from vault.decrypted_secrets
  where name = 'edge_functions_base_url'
  limit 1;
$$;

revoke all on function edge_functions_base_url() from public;


create or replace function trigger_send_push()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url text;
  v_key text;
begin
  select public.edge_functions_base_url() into v_url;
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_url is null or v_key is null then
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


create or replace function trigger_sync_user_role()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url text;
  v_key text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  select public.edge_functions_base_url() into v_url;
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_url is null or v_key is null then
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


create or replace function trigger_send_admin_summary()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url text;
  v_key text;
begin
  select public.edge_functions_base_url() into v_url;
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_url is null or v_key is null then
    raise notice 'send-admin-summary skipped: edge function dispatch is not configured';
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


create or replace function trigger_admin_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  if not is_admin() then
    raise exception 'permission_denied';
  end if;

  select public.edge_functions_base_url() into v_url;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret'
  limit 1;

  if v_url is null then
    raise exception 'edge_functions_base_url_not_configured';
  end if;

  if v_secret is null then
    raise exception 'trigger_secret_not_configured';
  end if;

  select net.http_post(
    url     := v_url || '/send-admin-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{"triggered_by":"admin"}'::jsonb
  ) into v_request_id;

  return jsonb_build_object('request_id', v_request_id);
end;
$$;

grant execute on function trigger_admin_summary() to authenticated;
