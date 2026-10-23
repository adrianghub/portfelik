-- Every creating transition uses the same immutable ownership binding. Commit
-- must not overwrite a UID already confirmed for cleanup/reconciliation.
create or replace function public.commit_demo_provision_reservation(p_reservation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));
  select status into v_status from public.demo_provision_reservations where id = p_reservation_id for update;
  if not found or v_status <> 'creating' then raise exception 'operation_not_creating'; end if;
  perform public.confirm_demo_provision_identity(p_reservation_id, p_user_id);
  perform public.register_demo_identity(p_user_id);
  update public.demo_provision_reservations set status = 'committed',
    committed_at = clock_timestamp() where id = p_reservation_id;
end;
$$;
revoke all on function public.commit_demo_provision_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_demo_provision_reservation(uuid, uuid) to service_role;
