-- Patch transfer_group_ownership to keep group_members.role in sync.
-- Before this fix: transferring ownership updated user_groups.owner_id but left
-- role = 'owner' on the old owner and did not promote the new owner, so
-- is_group_co_owner and any role-based UI/exports reported the wrong state.

create or replace function transfer_group_ownership(
  p_group_id     uuid,
  p_new_owner_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from user_groups
    where id       = p_group_id
      and owner_id = v_caller_id
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from group_members
    where group_id = p_group_id
      and user_id  = p_new_owner_id
  ) then
    raise exception 'new_owner_not_member'
      using errcode = 'P0001',
            hint    = 'The new owner must already be a member of the group.';
  end if;

  -- Demote the outgoing owner to member.
  update group_members
  set role = 'member'
  where group_id = p_group_id
    and user_id  = v_caller_id;

  -- Promote the incoming owner.
  update group_members
  set role = 'owner'
  where group_id = p_group_id
    and user_id  = p_new_owner_id;

  update user_groups
  set owner_id   = p_new_owner_id,
      updated_at = now()
  where id = p_group_id;
end;
$$;

revoke all on function transfer_group_ownership(uuid, uuid) from public;
revoke all on function transfer_group_ownership(uuid, uuid) from anon;
grant execute on function transfer_group_ownership(uuid, uuid) to authenticated;
