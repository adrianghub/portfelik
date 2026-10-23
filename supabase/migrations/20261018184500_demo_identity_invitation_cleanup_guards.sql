-- B1 follow-up: invitation cleanup RPCs cannot elevate membership, but they
-- must still refuse demo actors (defense in depth + consistent demo_not_allowed).

CREATE OR REPLACE FUNCTION public.cancel_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.group_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  perform public.assert_real_capable(v_uid);
  select * into v_invitation from public.group_invitations where id = p_invitation_id for update;
  if v_invitation is null then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.created_by is distinct from v_uid and not exists (
    select 1 from public.user_groups where id = v_invitation.group_id and owner_id = v_uid
  ) then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  update public.group_invitations set status = 'cancelled', updated_at = now() where id = p_invitation_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.group_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  perform public.assert_real_capable(v_uid);
  select * into v_invitation from public.group_invitations where id = p_invitation_id for update;
  if v_invitation is null then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.invited_user_email is distinct from lower((select auth.jwt() ->> 'email')) then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;
  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  update public.group_invitations set status = 'rejected', updated_at = now() where id = p_invitation_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_group_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.group_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  perform public.assert_real_capable(v_uid);
  select * into v_invitation from public.group_invitations where id = p_invitation_id for update;
  if v_invitation is null then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.created_by is distinct from v_uid and not exists (
    select 1 from public.user_groups where id = v_invitation.group_id and owner_id = v_uid
  ) then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if v_invitation.status = 'pending' and v_invitation.expires_at > now() then
    raise exception 'invitation_still_pending' using errcode = 'P0001';
  end if;
  -- Token hashes cascade; accepted membership stays intact.
  delete from public.group_invitations where id = p_invitation_id;
end;
$function$;
