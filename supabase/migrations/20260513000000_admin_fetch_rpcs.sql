-- Admin-scoped read RPCs for /admin/notifications diagnostic page.
-- Bypass RLS (SECURITY DEFINER) so admins can see system-wide rows.
-- All callers must pass is_admin() guard or RPC raises permission_denied.

create or replace function fetch_admin_notifications(p_limit int default 50)
returns table (
  id uuid,
  user_id uuid,
  type notification_type,
  title text,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'permission_denied';
  end if;

  return query
  select n.id, n.user_id, n.type, n.title, n.body, n.data, n.read_at, n.created_at
  from notifications n
  order by n.created_at desc
  limit p_limit;
end;
$$;

grant execute on function fetch_admin_notifications(int) to authenticated;


create or replace function fetch_admin_push_subscriptions()
returns table (
  endpoint text,
  user_id uuid,
  device_type text,
  user_agent text,
  created_at timestamptz,
  last_used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'permission_denied';
  end if;

  return query
  select ps.endpoint, ps.user_id, ps.device_type, ps.user_agent, ps.created_at, ps.last_used_at
  from push_subscriptions ps
  order by ps.last_used_at desc;
end;
$$;

grant execute on function fetch_admin_push_subscriptions() to authenticated;


create or replace function delete_admin_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'permission_denied';
  end if;

  delete from push_subscriptions where endpoint = p_endpoint;
end;
$$;

grant execute on function delete_admin_push_subscription(text) to authenticated;
