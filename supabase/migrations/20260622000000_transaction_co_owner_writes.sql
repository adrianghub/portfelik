-- Align group transaction writes with plans: co-owner/owner manage; members read + settle only.

drop policy if exists "transactions: update own or group" on transactions;
drop policy if exists "transactions: delete own or group" on transactions;

create policy "transactions: update own or co-owner"
  on transactions for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  )
  with check (
    (
      user_id = (select auth.uid())
      and (
        group_id is null
        or (select public.is_group_member(group_id))
      )
    )
    or (
      user_id <> (select auth.uid())
      and group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

create policy "transactions: delete own or co-owner"
  on transactions for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

comment on policy "transactions: update own or co-owner" on transactions is
  'Transaction creator or group owner/co-owner may edit group-scoped rows.';
