-- Fix infinite recursion between user_groups and group_invitations RLS policies.
-- Cycle: user_groups policy queries group_invitations → group_invitations "group owner can read"
-- policy queries user_groups → loop.
--
-- Fix: replace the user_groups subquery in group_invitations policy with a
-- SECURITY DEFINER function that reads user_groups bypassing RLS.

create or replace function is_group_owner(p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from user_groups
    where id = p_group_id
      and owner_id = (select auth.uid())
  );
$$;

drop policy if exists "group_invitations: group owner can read" on group_invitations;

create policy "group_invitations: group owner can read"
  on group_invitations for select
  to authenticated
  using (is_group_owner(group_id));
