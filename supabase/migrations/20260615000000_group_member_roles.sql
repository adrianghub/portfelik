-- Minimal group roles: owner (via user_groups.owner_id), co-owner, member.
-- Owners and co-owners can manage group-scoped plans/transactions; members participate.

create type group_member_role as enum ('owner', 'co_owner', 'member');

alter table group_members
  add column role group_member_role not null default 'member';

comment on column group_members.role is
  'Group role. Owner is also user_groups.owner_id; co-owners can manage group-scoped data.';

-- Backfill: group owners get role=owner
update group_members gm
set role = 'owner'
from user_groups ug
where ug.id = gm.group_id
  and ug.owner_id = gm.user_id;

create or replace function is_group_co_owner(p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and role in ('owner', 'co_owner')
  );
$$;

comment on function is_group_co_owner(uuid) is
  'True when caller is group owner or nominated co-owner.';

create or replace function nominate_group_co_owner(
  p_group_id uuid,
  p_user_id  uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not is_group_owner(p_group_id) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'user_not_member' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from user_groups
    where id = p_group_id and owner_id = p_user_id
  ) then
    raise exception 'cannot_change_owner_role' using errcode = 'P0001';
  end if;

  update group_members
  set role = 'co_owner'
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function revoke_group_co_owner(
  p_group_id uuid,
  p_user_id  uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not is_group_owner(p_group_id) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  update group_members
  set role = 'member'
  where group_id = p_group_id
    and user_id = p_user_id
    and role = 'co_owner';
end;
$$;

-- Patch create_group to set owner role on insert
create or replace function create_group(p_name text)
  returns user_groups
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_group user_groups;
begin
  insert into user_groups (name, owner_id)
  values (p_name, auth.uid())
  returning * into v_group;

  insert into group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'owner');

  return v_group;
end;
$$;

-- accept_invitation: new members start as member
create or replace function accept_invitation(p_invitation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_invitation group_invitations;
  v_caller_email text := lower((select auth.jwt() ->> 'email'));
begin
  select * into v_invitation
  from group_invitations
  where id = p_invitation_id;

  if v_invitation is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;

  if v_invitation.invited_user_email != v_caller_email then
    raise exception 'email_mismatch'
      using errcode = 'P0001',
            hint    = 'This invitation was not sent to your email address.';
  end if;

  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending'
      using errcode = 'P0001',
            hint    = 'Invitation status: ' || v_invitation.status;
  end if;

  update group_invitations
  set status          = 'accepted',
      invited_user_id = auth.uid(),
      updated_at      = now()
  where id = p_invitation_id;

  insert into group_members (group_id, user_id, role)
  values (v_invitation.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
end;
$$;

revoke all on function is_group_co_owner(uuid) from public;
revoke all on function is_group_co_owner(uuid) from anon;
revoke all on function nominate_group_co_owner(uuid, uuid) from public;
revoke all on function nominate_group_co_owner(uuid, uuid) from anon;
revoke all on function revoke_group_co_owner(uuid, uuid) from public;
revoke all on function revoke_group_co_owner(uuid, uuid) from anon;

grant execute on function is_group_co_owner(uuid) to authenticated;
grant execute on function nominate_group_co_owner(uuid, uuid) to authenticated;
grant execute on function revoke_group_co_owner(uuid, uuid) to authenticated;

grant select on table group_members to authenticated;
