-- -----------------------------------------------------------------------------
-- remove_group_member(group_id, user_id)
-- Only the group owner can remove a member. Owner cannot remove themselves
-- (use leave_group or disband_group instead).
-- -----------------------------------------------------------------------------
create or replace function remove_group_member(p_group_id uuid, p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
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
$$;

grant execute on function remove_group_member to authenticated;
