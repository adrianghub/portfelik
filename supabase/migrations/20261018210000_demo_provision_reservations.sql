-- B2 follow-up: in-flight capacity reservations so parallel Edge isolates
-- cannot overshoot DEMO_PROVISION_GLOBAL_MAX_ACTIVE between claim and register.

create table public.demo_provision_reservations (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  status text not null default 'held'
    check (status in ('held', 'committed', 'released')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  committed_at timestamptz null,
  released_at timestamptz null,
  user_id uuid null,
  constraint demo_provision_reservations_terminal_user
    check (
      (status = 'committed' and user_id is not null)
      or (status is distinct from 'committed')
    )
);

create index demo_provision_reservations_held_expires_idx
  on public.demo_provision_reservations (expires_at)
  where status = 'held';

comment on table public.demo_provision_reservations is
  'In-flight demo provision capacity holds. Held+unexpired rows count toward global cap until commit/release/expiry.';

alter table public.demo_provision_reservations enable row level security;
revoke all on table public.demo_provision_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.demo_provision_reservations to service_role;

-- Expire stale holds (idempotent).
create or replace function public.expire_demo_provision_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  with expired as (
    update public.demo_provision_reservations
    set status = 'released',
        released_at = now()
    where status = 'held'
      and expires_at <= now()
    returning 1
  )
  select count(*)::integer into v_count from expired;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_demo_provision_reservations()
  from public, anon, authenticated;
grant execute on function public.expire_demo_provision_reservations() to service_role;

-- Claim returns a reservation id. Capacity = active demos + held unexpired.
create or replace function public.claim_demo_provision_slot(
  p_client_key text,
  p_window_seconds integer default 60,
  p_max_per_window integer default 5,
  p_global_max_active integer default 500,
  p_hold_seconds integer default 120
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := left(trim(coalesce(p_client_key, '')), 128);
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_max integer := greatest(coalesce(p_max_per_window, 5), 1);
  v_global integer := greatest(coalesce(p_global_max_active, 500), 1);
  v_hold integer := greatest(coalesce(p_hold_seconds, 120), 15);
  v_active bigint;
  v_held bigint;
  v_recent bigint;
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if v_key = '' then
    raise exception 'invalid_client_key' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));

  -- Free expired holds before counting capacity.
  update public.demo_provision_reservations
  set status = 'released',
      released_at = now()
  where status = 'held'
    and expires_at <= now();

  select count(*) into v_active
  from public.demo_identities d
  where d.retired_at is null;

  select count(*) into v_held
  from public.demo_provision_reservations r
  where r.status = 'held'
    and r.expires_at > now();

  if (v_active + v_held) >= v_global then
    raise exception 'demo_capacity_exhausted' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo_provision:' || v_key, 0));

  select count(*) into v_recent
  from public.demo_provision_attempts a
  where a.client_key = v_key
    and a.created_at >= now() - make_interval(secs => v_window);

  if v_recent >= v_max then
    raise exception 'demo_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.demo_provision_attempts (client_key)
  values (v_key);

  insert into public.demo_provision_reservations (client_key, status, expires_at)
  values (v_key, 'held', now() + make_interval(secs => v_hold))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.claim_demo_provision_slot(text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_demo_provision_slot(text, integer, integer, integer, integer)
  to service_role;

-- Drop previous 4-arg overload from 20261018200000 if present.
drop function if exists public.claim_demo_provision_slot(text, integer, integer, integer);

create or replace function public.commit_demo_provision_reservation(
  p_reservation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_reservation_id is null or p_user_id is null then
    raise exception 'invalid_reservation' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));

  update public.demo_provision_reservations
  set status = 'committed',
      committed_at = now(),
      user_id = p_user_id
  where id = p_reservation_id
    and status = 'held'
    and expires_at > now();

  if not found then
    raise exception 'reservation_not_held' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.commit_demo_provision_reservation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_demo_provision_reservation(uuid, uuid)
  to service_role;

create or replace function public.release_demo_provision_reservation(
  p_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_reservation_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));

  update public.demo_provision_reservations
  set status = 'released',
      released_at = now()
  where id = p_reservation_id
    and status = 'held';
end;
$$;

revoke all on function public.release_demo_provision_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.release_demo_provision_reservation(uuid)
  to service_role;
