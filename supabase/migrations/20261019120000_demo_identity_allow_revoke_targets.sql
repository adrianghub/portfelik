-- B1 follow-up: allow privileged actors to revoke/remove entitlements from
-- demo-marked targets, while grant/elevation paths stay fail-closed on both
-- actor and target. Also refuse register_demo_identity when the UID already
-- holds real social/admin entitlements (prevents sticky shared RLS access).

-- ---------------------------------------------------------------------------
-- register_demo_identity: reject UIDs with existing real entitlements
-- ---------------------------------------------------------------------------
create or replace function public.register_demo_identity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  -- Demo identities must not carry group membership, ownership, or admin.
  -- Otherwise group-shared RLS would keep exposing peer data while revoke
  -- paths (before this migration) could not clean the row up.
  if exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id
  ) then
    raise exception 'demo_has_real_entitlements'
      using errcode = 'P0001',
            hint = 'Remove group membership before registering a demo identity.';
  end if;

  if exists (
    select 1 from public.user_groups ug where ug.owner_id = p_user_id
  ) then
    raise exception 'demo_has_real_entitlements'
      using errcode = 'P0001',
            hint = 'Transfer or disband owned groups before registering a demo identity.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'admin'
  ) then
    raise exception 'demo_has_real_entitlements'
      using errcode = 'P0001',
            hint = 'Revoke admin role before registering a demo identity.';
  end if;

  insert into public.demo_identities (user_id)
  values (p_user_id)
  on conflict (user_id) do update
    set retired_at = null;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('account_kind', 'demo')
  where id = p_user_id;
end;
$$;

comment on function public.register_demo_identity(uuid) is
  'Service-only: mark Auth UID as demo. Refuses UIDs with group membership, ownership, or admin.';

revoke all on function public.register_demo_identity(uuid) from public, anon, authenticated;
grant execute on function public.register_demo_identity(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Revoke / remove: assert actor only (not the target)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Actor must be real-capable. Target may already be demo so owners can
  -- clean up inconsistent membership without elevation.
  perform public.assert_real_capable(auth.uid());
  if not exists (
    select 1 from user_groups
    where id = p_group_id and owner_id = (select auth.uid())
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001',
            hint    = 'Only the group owner can remove members.';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_remove_self'
      using errcode = 'P0001',
            hint    = 'Use leave_group to leave a group.';
  end if;

  delete from group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_group_co_owner(p_group_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  if not is_group_owner(p_group_id) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  update group_members
  set role = 'member'
  where group_id = p_group_id
    and user_id = p_user_id
    and role = 'co_owner';
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_admin_role(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  if not (select is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Prevent self-revocation (avoids accidental admin lockout)
  if p_user_id = auth.uid() then
    raise exception 'cannot_revoke_own_admin'
      using errcode = 'P0001',
            hint    = 'Ask another admin to revoke your role.';
  end if;

  update profiles
  set role = 'user', updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
end;
$function$;
