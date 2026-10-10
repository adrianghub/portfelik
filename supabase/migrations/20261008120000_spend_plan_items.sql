-- Project budgets (trips, renovations, weddings). A budget is a planned cap,
-- not cash set aside and not a change to the account balance.
-- Payment facts arrive later, by linking existing transactions.

alter table public.plans
  drop constraint if exists plans_kind_check;

alter table public.plans
  add constraint plans_kind_check check (kind in ('save', 'debt', 'spend'));

alter table public.plans
  drop constraint if exists plans_spend_budget_required;

alter table public.plans
  add constraint plans_spend_budget_required
  check (kind <> 'spend' or (budget_amount is not null and budget_amount > 0));

comment on column public.plans.kind is
  'Plan intent: save (target accumulation), debt (loan repayment), or spend (project budget). A spend budget is a planned cap, not cash set aside.';

comment on column public.plans.budget_amount is
  'Spend plans: required planned spending cap. Save and debt leave this empty. It is not an account balance.';

create table public.plan_items (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans(id) on delete cascade,
  label      text not null,
  amount     numeric(12, 2) not null,
  due_date   date,
  status     text not null,
  payee      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_items_label_nonempty check (length(btrim(label)) > 0),
  constraint plan_items_label_length check (length(label) <= 120),
  constraint plan_items_amount_positive check (amount > 0),
  constraint plan_items_status_check check (status in ('estimated', 'reserved', 'cancelled')),
  constraint plan_items_estimated_without_date check (status <> 'estimated' or due_date is null),
  constraint plan_items_reserved_has_date check (status <> 'reserved' or due_date is not null),
  constraint plan_items_payee_length check (payee is null or length(payee) <= 160)
);

comment on table public.plan_items is
  'Cost lines of a spend plan. Status is a commitment, not proof that money left an account.';
comment on column public.plan_items.amount is
  'Planned PLN amount. Positive magnitude. Not a ledger posting.';
comment on column public.plan_items.due_date is
  'Optional payment date. May fall outside the plan period, because a deposit can precede the project.';
comment on column public.plan_items.status is
  'estimated: no date, not a due payment. reserved: dated commitment, money may not have left. cancelled: excluded from totals.';

create index idx_plan_items_plan_created
  on public.plan_items(plan_id, created_at);

create trigger set_updated_at
  before update on public.plan_items
  for each row execute function public.handle_updated_at();

create or replace function public.plan_items_require_active_spend_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan public.plans;
begin
  select * into v_plan from public.plans where id = new.plan_id;
  if not found or v_plan.kind is distinct from 'spend' then
    raise exception 'plan_item_requires_spend' using errcode = 'P0001';
  end if;
  if v_plan.status is distinct from 'active' then
    raise exception 'plan_not_active' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger plan_items_require_active_spend_plan
  before insert or update on public.plan_items
  for each row execute function public.plan_items_require_active_spend_plan();

alter table public.plan_items enable row level security;

create policy "plan_items: select when plan visible"
  on public.plan_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.plans p
      where p.id = plan_items.plan_id
        and (
          (p.group_id is null and p.user_id = (select auth.uid()))
          or (p.group_id is not null and (select public.is_group_member(p.group_id)))
        )
    )
  );

create policy "plan_items: insert when plan writable"
  on public.plan_items for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.plans p
      where p.id = plan_items.plan_id
        and (
          (
            p.user_id = (select auth.uid())
            and (p.group_id is null or (select public.is_group_member(p.group_id)))
          )
          or (p.group_id is not null and (select public.is_group_co_owner(p.group_id)))
        )
    )
  );

create policy "plan_items: update when plan writable"
  on public.plan_items for update
  to authenticated
  using (
    exists (
      select 1
      from public.plans p
      where p.id = plan_items.plan_id
        and (
          (
            p.user_id = (select auth.uid())
            and (p.group_id is null or (select public.is_group_member(p.group_id)))
          )
          or (p.group_id is not null and (select public.is_group_co_owner(p.group_id)))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.plans p
      where p.id = plan_items.plan_id
        and (
          (
            p.user_id = (select auth.uid())
            and (p.group_id is null or (select public.is_group_member(p.group_id)))
          )
          or (p.group_id is not null and (select public.is_group_co_owner(p.group_id)))
        )
    )
  );

create policy "plan_items: delete when plan writable"
  on public.plan_items for delete
  to authenticated
  using (
    exists (
      select 1
      from public.plans p
      where p.id = plan_items.plan_id
        and (
          (
            p.user_id = (select auth.uid())
            and (p.group_id is null or (select public.is_group_member(p.group_id)))
          )
          or (p.group_id is not null and (select public.is_group_co_owner(p.group_id)))
        )
    )
  );

revoke all on table public.plan_items from public, anon;
grant select, insert, delete on table public.plan_items to authenticated;
grant update (label, amount, due_date, status, payee, updated_at)
  on table public.plan_items to authenticated;
