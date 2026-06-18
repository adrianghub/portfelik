-- Refinance is a debt-plan operation: archive the old plan, create the new one, link them.
-- No transactions are written. RLS is unchanged: ownership/group rules already gate plans.

alter table public.plans
  add column if not exists status text not null default 'active'
    check (status in ('active', 'refinanced', 'closed')),
  add column if not exists refinanced_from_plan_id uuid
    references public.plans(id) on delete set null,
  add column if not exists replaced_by_plan_id uuid
    references public.plans(id) on delete set null;

comment on column public.plans.status is
  'Lifecycle: active (default), refinanced (replaced by a newer loan), closed.';
comment on column public.plans.refinanced_from_plan_id is
  'For a new loan: the prior plan it refinanced.';
comment on column public.plans.replaced_by_plan_id is
  'For an old loan: the newer plan that replaced it.';

create index if not exists idx_plans_status on public.plans(user_id, status);

grant update (status, refinanced_from_plan_id, replaced_by_plan_id)
  on table public.plans to authenticated;
