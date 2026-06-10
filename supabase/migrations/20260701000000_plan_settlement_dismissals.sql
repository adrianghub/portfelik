-- Persist "Pomiń" (skip) decisions on plan settlement suggestions.
-- Without storage, dismissed suggestions reappear after every reload.
-- Dismissals are scoped per plan+transaction and shared with everyone who can
-- see the plan (group members see the same cleaned-up suggestion list).

create table public.plan_settlement_dismissals (
  id              uuid        primary key default gen_random_uuid(),
  plan_id         uuid        not null references public.plans(id) on delete cascade,
  transaction_id  uuid        not null references public.transactions(id) on delete cascade,
  dismissed_by    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  constraint plan_settlement_dismissals_plan_tx_unique unique (plan_id, transaction_id)
);

comment on table public.plan_settlement_dismissals is
  'Suggestions explicitly skipped on the plan settle screen. Hidden, not deleted; linking elsewhere is unaffected.';

create index idx_plan_settlement_dismissals_plan_id
  on public.plan_settlement_dismissals(plan_id);

alter table public.plan_settlement_dismissals enable row level security;

create policy "plan_settlement_dismissals: select when plan visible"
  on public.plan_settlement_dismissals for select
  to authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_settlement_dismissals.plan_id
        and (
          p.user_id = (select auth.uid())
          or (p.group_id is not null and (select public.is_group_member(p.group_id)))
        )
    )
  );

create policy "plan_settlement_dismissals: insert when plan and tx visible"
  on public.plan_settlement_dismissals for insert
  to authenticated
  with check (
    dismissed_by = (select auth.uid())
    and exists (
      select 1 from public.plans p
      where p.id = plan_settlement_dismissals.plan_id
        and (
          p.user_id = (select auth.uid())
          or (p.group_id is not null and (select public.is_group_member(p.group_id)))
        )
    )
    and exists (
      select 1 from public.transactions t
      where t.id = plan_settlement_dismissals.transaction_id
        and (
          t.user_id = (select auth.uid())
          or (t.group_id is not null and (select public.is_group_member(t.group_id)))
        )
    )
  );

create policy "plan_settlement_dismissals: delete when plan visible"
  on public.plan_settlement_dismissals for delete
  to authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_settlement_dismissals.plan_id
        and (
          p.user_id = (select auth.uid())
          or (p.group_id is not null and (select public.is_group_member(p.group_id)))
        )
    )
  );

-- Data API grants are not automatic for new public tables; keep them narrow.
revoke all on table public.plan_settlement_dismissals from public;
revoke all on table public.plan_settlement_dismissals from anon;
grant select, insert, delete on table public.plan_settlement_dismissals to authenticated;
