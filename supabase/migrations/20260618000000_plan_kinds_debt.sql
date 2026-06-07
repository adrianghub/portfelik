-- Plan kinds: spend (default), save (goals), debt (kredyty).
-- plan_debt_terms holds amortization inputs for kind=debt plans.

alter table public.plans
  add column if not exists kind text not null default 'spend'
    check (kind in ('spend', 'save', 'debt'));

alter table public.plans
  add column if not exists target_amount numeric(12, 2)
    check (target_amount is null or target_amount > 0);

comment on column public.plans.kind is
  'Plan intent: spend (budget), save (target accumulation), debt (loan repayment).';
comment on column public.plans.target_amount is
  'Target amount for save plans; optional payoff framing for debt plans.';

alter table public.plans
  add constraint plans_save_target_required
  check (kind <> 'save' or target_amount is not null);

create index if not exists idx_plans_user_kind
  on public.plans(user_id, kind, start_date);

grant update (kind, target_amount) on table public.plans to authenticated;

create table public.plan_debt_terms (
  plan_id               uuid            primary key references public.plans(id) on delete cascade,
  original_amount       numeric(12, 2)  not null check (original_amount > 0),
  current_balance       numeric(12, 2)  not null check (current_balance >= 0),
  annual_rate           numeric(7, 4)   not null check (annual_rate >= 0),
  monthly_payment       numeric(12, 2)  not null check (monthly_payment > 0),
  payment_day           smallint        check (payment_day is null or payment_day between 1 and 28),
  anchor_transaction_id uuid            references public.transactions(id) on delete set null,
  created_at            timestamptz     not null default now(),
  updated_at            timestamptz     not null default now(),
  constraint plan_debt_terms_balance_lte_original
    check (current_balance <= original_amount)
);

comment on table public.plan_debt_terms is
  'Loan terms for debt plans. Generic: hipoteka, auto, consumer credit.';

create trigger set_updated_at
  before update on public.plan_debt_terms
  for each row execute function public.handle_updated_at();

alter table public.plan_debt_terms enable row level security;

create policy "plan_debt_terms: select via plan"
  on public.plan_debt_terms for select
  to authenticated
  using (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and (
              p.user_id = (select auth.uid())
           or (p.group_id is not null and (select public.is_group_member(p.group_id)))
         )
    )
  );

create policy "plan_debt_terms: insert via plan owner"
  on public.plan_debt_terms for insert
  to authenticated
  with check (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and p.kind = 'debt'
         and p.user_id = (select auth.uid())
    )
  );

create policy "plan_debt_terms: update via plan"
  on public.plan_debt_terms for update
  to authenticated
  using (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and (
              p.user_id = (select auth.uid())
           or (p.group_id is not null and (select public.is_group_member(p.group_id)))
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
           or (p.group_id is not null and (select public.is_group_member(p.group_id)))
         )
    )
  );

create policy "plan_debt_terms: delete via plan owner"
  on public.plan_debt_terms for delete
  to authenticated
  using (
    exists (
      select 1 from public.plans p
       where p.id = plan_id
         and p.user_id = (select auth.uid())
    )
  );

grant select, insert, delete on table public.plan_debt_terms to authenticated;
grant update (
  original_amount,
  current_balance,
  annual_rate,
  monthly_payment,
  payment_day,
  anchor_transaction_id,
  updated_at
) on table public.plan_debt_terms to authenticated;
