-- Persist ownership while the Auth row exists, before any cleanup deletion.
-- Never infer completion of an unknown createUser from a missing Auth row.
create or replace function public.confirm_demo_provision_identity(
  p_reservation_id uuid, p_user_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_operation public.demo_provision_reservations%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  select * into v_operation from public.demo_provision_reservations where id = p_reservation_id for update;
  if not found or v_operation.status not in ('creating', 'committed')
    or p_user_id is null
    or (v_operation.user_id is not null and v_operation.user_id <> p_user_id) then
    raise exception 'invalid_identity_confirmation';
  end if;
  perform 1 from auth.users u where u.id = p_user_id
    and lower(u.email) = v_operation.email
    and u.raw_app_meta_data ->> 'account_kind' = 'demo'
    and u.raw_app_meta_data ->> 'demo_provision_nonce' = v_operation.provision_nonce
    for share;
  if not found then raise exception 'operation_identity_mismatch'; end if;
  update public.demo_provision_reservations set user_id = p_user_id where id = p_reservation_id;
end;
$$;
revoke all on function public.confirm_demo_provision_identity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_demo_provision_identity(uuid, uuid) to service_role;

-- The exact UID must already have been verified against Auth by atomic commit
-- or confirm_demo_provision_identity. NULL can never authorize a release.
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
    or v_operation.email is null or coalesce(v_operation.provision_nonce, '') = ''
    or v_operation.user_id is null or p_user_id is distinct from v_operation.user_id then
    raise exception 'invalid_cleanup_operation';
  end if;
  if exists (select 1 from auth.users where id = v_operation.user_id or lower(email) = v_operation.email) then
    raise exception 'cleanup_auth_still_exists';
  end if;
  update public.demo_provision_reservations set status = 'released', released_at = clock_timestamp()
    where id = p_reservation_id;
  delete from public.demo_provision_orphans where user_id = v_operation.user_id
    and email = v_operation.email and provision_nonce = v_operation.provision_nonce;
end;
$$;
revoke all on function public.complete_demo_provision_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_demo_provision_cleanup(uuid, uuid) to service_role;
