-- Forward-only P1 repair. One ledger API accepts both 4- and 5-argument calls.
drop function public.record_demo_provision_orphan(uuid, text, text, text);

alter table public.demo_provision_reservations
  drop constraint demo_provision_reservations_status_check;
alter table public.demo_provision_reservations
  add constraint demo_provision_reservations_status_check
    check (status in ('held', 'creating', 'committed', 'released')),
  add column email text,
  add column provision_nonce text;

-- Old handlers did not record whether Auth had started. Quarantine every old
-- held row, including expired ones; expiry is not evidence of Auth absence.
update public.demo_provision_reservations set status = 'creating' where status = 'held';

comment on table public.demo_provision_reservations is
  'Capacity and durable Auth operation journal. creating/committed never expire; release only after verified cleanup. Legacy creating rows without email require manual reconciliation.';

create or replace function public.begin_demo_provision_operation(
  p_reservation_id uuid, p_email text, p_nonce text
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;
  if coalesce(p_email, '') !~ '^demo\+[^@]+@demo\.jakstoimy\.local$'
    or coalesce(p_nonce, '') = '' then
    raise exception 'invalid_operation_identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  update public.demo_provision_reservations
  set status = 'creating', email = p_email, provision_nonce = p_nonce
  where id = p_reservation_id and status = 'held' and expires_at > clock_timestamp();
  if not found then raise exception 'reservation_not_held'; end if;
end;
$$;
revoke all on function public.begin_demo_provision_operation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_demo_provision_operation(uuid, text, text) to service_role;

create or replace function public.claim_demo_provision_slot(
  p_client_key text, p_window_seconds integer default 60,
  p_max_per_window integer default 5, p_global_max_active integer default 500,
  p_hold_seconds integer default 120
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_key text := left(trim(coalesce(p_client_key, '')), 128);
  v_active bigint;
  v_operations bigint;
  v_orphans bigint;
  v_recent bigint;
  v_id uuid;
  v_now timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  if v_key = '' then raise exception 'invalid_client_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  v_now := clock_timestamp();
  update public.demo_provision_reservations set status = 'released', released_at = v_now
    where status = 'held' and expires_at <= v_now;
  select count(*) into v_active from public.demo_identities where retired_at is null;
  -- An operation counts independently until registry represents the same UID.
  -- Even committed operations keep capacity if their registry is retired/missing.
  select count(*) into v_operations from public.demo_provision_reservations r
  where (r.status = 'held' and r.expires_at > v_now)
     or (r.status in ('creating', 'committed') and not exists (
       select 1 from public.demo_identities d where d.user_id = r.user_id and d.retired_at is null
     ));
  -- Include legacy orphans not already represented by registry or the journal.
  select count(*) into v_orphans from public.demo_provision_orphans o
  where not exists (select 1 from public.demo_identities d where d.user_id = o.user_id and d.retired_at is null)
    and not exists (
      select 1 from public.demo_provision_reservations r
      where r.status in ('creating', 'committed') and (r.user_id = o.user_id or r.email = o.email)
    );
  if v_active + v_operations + v_orphans >= greatest(coalesce(p_global_max_active, 500), 1) then
    raise exception 'demo_capacity_exhausted';
  end if;
  select count(*) into v_recent from public.demo_provision_attempts
    where client_key = v_key and created_at >= v_now - make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
  if v_recent >= greatest(coalesce(p_max_per_window, 5), 1) then raise exception 'demo_rate_limited'; end if;
  insert into public.demo_provision_attempts(client_key, created_at) values (v_key, v_now);
  insert into public.demo_provision_reservations(client_key, expires_at)
    values (v_key, v_now + make_interval(secs => greatest(coalesce(p_hold_seconds, 120), 15))) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.claim_demo_provision_slot(text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_demo_provision_slot(text, integer, integer, integer, integer) to service_role;

-- There is no separate registry-write window: verify, register and commit under
-- the same lock/transaction as claims. creating capacity survives any Auth delay.
create or replace function public.commit_demo_provision_reservation(p_reservation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_operation public.demo_provision_reservations%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  select * into v_operation from public.demo_provision_reservations where id = p_reservation_id for update;
  if not found or v_operation.status <> 'creating' then raise exception 'operation_not_creating'; end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user_id
      and lower(u.email) = v_operation.email
      and u.raw_app_meta_data ->> 'account_kind' = 'demo'
      and u.raw_app_meta_data ->> 'demo_provision_nonce' = v_operation.provision_nonce
  ) then raise exception 'operation_identity_mismatch'; end if;
  perform public.register_demo_identity(p_user_id);
  update public.demo_provision_reservations set status = 'committed', user_id = p_user_id,
    committed_at = clock_timestamp() where id = p_reservation_id;
end;
$$;
revoke all on function public.commit_demo_provision_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_demo_provision_reservation(uuid, uuid) to service_role;

-- Generic release cannot free capacity once Auth may have run.
create or replace function public.release_demo_provision_reservation(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  update public.demo_provision_reservations set status = 'released', released_at = clock_timestamp()
    where id = p_reservation_id and status = 'held';
end;
$$;
revoke all on function public.release_demo_provision_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_demo_provision_reservation(uuid) to service_role;

-- Call only after an owned UID was successfully deleted (not a timeout, read
-- failure, or merely a missing row before a potentially in-flight Auth create).
create or replace function public.complete_demo_provision_cleanup(p_reservation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_operation public.demo_provision_reservations%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  select * into v_operation from public.demo_provision_reservations where id = p_reservation_id for update;
  if not found or v_operation.status not in ('creating', 'committed')
    or v_operation.email is null or p_user_id is null
    or (v_operation.user_id is not null and v_operation.user_id <> p_user_id) then
    raise exception 'invalid_cleanup_operation';
  end if;
  if exists (select 1 from auth.users where id = p_user_id or lower(email) = v_operation.email) then
    raise exception 'cleanup_auth_still_exists';
  end if;
  update public.demo_provision_reservations set status = 'released', released_at = clock_timestamp(),
    user_id = p_user_id where id = p_reservation_id;
  delete from public.demo_provision_orphans where user_id = p_user_id
    and email = v_operation.email and provision_nonce = v_operation.provision_nonce;
end;
$$;
revoke all on function public.complete_demo_provision_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_demo_provision_cleanup(uuid, uuid) to service_role;
