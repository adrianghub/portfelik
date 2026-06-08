-- G2: group plan writes restricted to plan owner or group owner/co-owner.
-- Settlement RPCs unchanged - any group member can still link/unlink transactions.

drop policy if exists "plans: update own or group" on public.plans;
drop policy if exists "plans: delete own or group" on public.plans;

create policy "plans: update own or co-owner"
  on public.plans for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  )
  with check (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

create policy "plans: delete own or co-owner"
  on public.plans for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

drop policy if exists "plan_debt_terms: insert via plan owner" on public.plan_debt_terms;
drop policy if exists "plan_debt_terms: update via plan" on public.plan_debt_terms;
drop policy if exists "plan_debt_terms: delete via plan owner" on public.plan_debt_terms;

create policy "plan_debt_terms: insert via plan manager"
  on public.plan_debt_terms for insert
  to authenticated
  with check (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and p.kind = 'debt'
         and (
              p.user_id = (select auth.uid())
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
              p.user_id = (select auth.uid())
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
              p.user_id = (select auth.uid())
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
              p.user_id = (select auth.uid())
           or (
                p.group_id is not null
                and (select public.is_group_co_owner(p.group_id))
              )
         )
    )
  );

comment on policy "plans: update own or co-owner" on public.plans is
  'Plan creator or group owner/co-owner may edit group-scoped plans.';
comment on policy "plan_debt_terms: update via plan manager" on public.plan_debt_terms is
  'Debt terms writable by plan creator or group owner/co-owner only.';
