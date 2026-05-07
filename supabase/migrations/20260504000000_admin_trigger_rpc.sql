-- RPC for admins to manually trigger the weekly summary Edge Function.
-- Reads INTERNAL_TRIGGER_SECRET from Vault — never exposed to the frontend.
create or replace function trigger_admin_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  if not is_admin() then
    raise exception 'permission_denied';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret';

  if v_secret is null then
    raise exception 'trigger_secret_not_configured';
  end if;

  select net.http_post(
    url     := 'https://emqzcygfwcvbmhxhfkcc.supabase.co/functions/v1/send-admin-summary',
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
