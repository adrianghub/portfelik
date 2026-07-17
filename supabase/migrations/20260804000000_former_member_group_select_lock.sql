-- Former group members must not retain SELECT on group-scoped rows they authored.
-- Private rows stay creator-visible; group rows require current membership.

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
drop policy if exists "transactions: select own or group" on public.transactions;

create policy "transactions: select own or group"
  on public.transactions for select
  to authenticated
  using (
    (
      group_id is null
      and user_id = (select auth.uid())
    )
    or (
      group_id is not null
      and (select public.is_group_member(group_id))
    )
  );

comment on policy "transactions: select own or group" on public.transactions is
  'Private rows: creator only. Group rows: any current member (leave removes access).';

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
drop policy if exists "plans: select own or group" on public.plans;

create policy "plans: select own or group"
  on public.plans for select
  to authenticated
  using (
    (
      group_id is null
      and user_id = (select auth.uid())
    )
    or (
      group_id is not null
      and (select public.is_group_member(group_id))
    )
  );

comment on policy "plans: select own or group" on public.plans is
  'Private rows: creator only. Group rows: any current member (leave removes access).';
