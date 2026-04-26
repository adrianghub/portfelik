-- Fix infinite recursion in group_members RLS select policy.
-- The original policy queried group_members from within a group_members policy → loop.
-- is_group_member() is SECURITY DEFINER, so its internal query bypasses RLS entirely.

drop policy if exists "group_members: members can read their group roster" on group_members;

create policy "group_members: members can read their group roster"
  on group_members for select
  to authenticated
  using (is_group_member(group_id));
