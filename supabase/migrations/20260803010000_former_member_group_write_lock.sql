-- Former group members must not retain write access to group-scoped rows they created.
-- Settlement RPCs (link_plan_transaction, etc.) intentionally keep is_group_member for
-- any current member to link/unlink; this migration tightens direct table writes only.

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
drop policy if exists "transactions: update own or co-owner" on public.transactions;
drop policy if exists "transactions: delete own or co-owner" on public.transactions;

create policy "transactions: update own or co-owner"
  on public.transactions for update
  to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (
        group_id is null
        or (select public.is_group_member(group_id))
      )
    )
    or (
      group_id is not null
      and user_id <> (select auth.uid())
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
  on public.transactions for delete
  to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (
        group_id is null
        or (select public.is_group_member(group_id))
      )
    )
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

comment on policy "transactions: update own or co-owner" on public.transactions is
  'Private rows: creator only. Group rows: creator while still a member, or owner/co-owner.';

-- ---------------------------------------------------------------------------
-- plans + debt terms
-- ---------------------------------------------------------------------------
drop policy if exists "plans: update own or co-owner" on public.plans;
drop policy if exists "plans: delete own or co-owner" on public.plans;

create policy "plans: update own or co-owner"
  on public.plans for update
  to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (
        group_id is null
        or (select public.is_group_member(group_id))
      )
    )
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
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

create policy "plans: delete own or co-owner"
  on public.plans for delete
  to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (
        group_id is null
        or (select public.is_group_member(group_id))
      )
    )
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

drop policy if exists "plan_debt_terms: insert via plan manager" on public.plan_debt_terms;
drop policy if exists "plan_debt_terms: update via plan manager" on public.plan_debt_terms;
drop policy if exists "plan_debt_terms: delete via plan manager" on public.plan_debt_terms;

create policy "plan_debt_terms: insert via plan manager"
  on public.plan_debt_terms for insert
  to authenticated
  with check (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and p.kind = 'debt'
         and (
              (
                p.user_id = (select auth.uid())
                and (
                  p.group_id is null
                  or (select public.is_group_member(p.group_id))
                )
              )
           or (
                p.group_id is not null
                and (select public.is_group_co_owner(p.group_id))
              )
         )
    )
  );

create policy "plan_debt_terms: update via plan manager"
  on public.plan_debt_terms for update
  to authenticated
  using (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and (
              (
                p.user_id = (select auth.uid())
                and (
                  p.group_id is null
                  or (select public.is_group_member(p.group_id))
                )
              )
           or (
                p.group_id is not null
                and (select public.is_group_co_owner(p.group_id))
              )
         )
    )
  )
  with check (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and p.kind = 'debt'
         and (
              (
                p.user_id = (select auth.uid())
                and (
                  p.group_id is null
                  or (select public.is_group_member(p.group_id))
                )
              )
           or (
                p.group_id is not null
                and (select public.is_group_co_owner(p.group_id))
              )
         )
    )
  );

create policy "plan_debt_terms: delete via plan manager"
  on public.plan_debt_terms for delete
  to authenticated
  using (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and (
              (
                p.user_id = (select auth.uid())
                and (
                  p.group_id is null
                  or (select public.is_group_member(p.group_id))
                )
              )
           or (
                p.group_id is not null
                and (select public.is_group_co_owner(p.group_id))
              )
         )
    )
  );

-- ---------------------------------------------------------------------------
-- recurring occurrence skips (creator path)
-- ---------------------------------------------------------------------------
drop policy if exists "recurring skips: insert own or co-owner" on public.recurring_occurrence_skips;

create policy "recurring skips: insert own or co-owner"
  on public.recurring_occurrence_skips for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        user_id = (select auth.uid())
        and (
          group_id is null
          or (select public.is_group_member(group_id))
        )
      )
      or (
        group_id is not null
        and (select public.is_group_co_owner(group_id))
      )
    )
  );
