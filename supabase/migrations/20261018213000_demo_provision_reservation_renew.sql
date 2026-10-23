-- Renew/assert a held reservation before mutating Auth/registry so an expired
-- hold cannot race with a second provisioner under a tight global cap.

create or replace function public.renew_demo_provision_reservation(
  p_reservation_id uuid,
  p_hold_seconds integer default 120
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold integer := greatest(coalesce(p_hold_seconds, 120), 15);
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_reservation_id is null then
    raise exception 'invalid_reservation' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));

  -- Expire any stale holds first so capacity accounting stays consistent.
  update public.demo_provision_reservations
  set status = 'released',
      released_at = now()
  where status = 'held'
    and expires_at <= now()
    and id is distinct from p_reservation_id;

  update public.demo_provision_reservations
  set expires_at = now() + make_interval(secs => v_hold)
  where id = p_reservation_id
    and status = 'held'
    and expires_at > now();

  if not found then
    raise exception 'reservation_not_held' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.renew_demo_provision_reservation(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.renew_demo_provision_reservation(uuid, integer)
  to service_role;
