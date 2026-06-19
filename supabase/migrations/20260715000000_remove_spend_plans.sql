-- Remove redundant spend/expense plans from the Plans product model.
-- Transactions remain untouched; plan links are intent metadata and cascade
-- with the deleted plans.

delete from public.plans
where kind = 'spend';

alter table public.plans
  alter column kind drop default;

alter table public.plans
  drop constraint if exists plans_kind_check;

alter table public.plans
  add constraint plans_kind_check check (kind in ('save', 'debt'));

comment on column public.plans.kind is
  'Plan intent: save (target accumulation) or debt (loan repayment). Spend/expense plans were removed in 20260715000000.';

create or replace function public.link_plan_transaction(
  p_plan_id        uuid,
  p_transaction_id uuid
)
  returns public.plan_transaction_links
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_plan public.plans;
  v_tx   public.transactions;
  v_link public.plan_transaction_links;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  if v_plan.user_id <> auth.uid()
    and not (v_plan.group_id is not null and public.is_group_member(v_plan.group_id))
  then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;

  if v_tx.user_id <> auth.uid()
    and not (v_tx.group_id is not null and public.is_group_member(v_tx.group_id))
  then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;

  if v_tx.type not in ('expense', 'income') then
    raise exception 'transaction_type_not_supported' using errcode = 'P0001';
  end if;

  if v_plan.kind = 'save' and v_tx.type <> 'income' then
    raise exception 'transaction_type_not_supported'
      using errcode = 'P0001',
            hint = 'Saving goals can only link income transactions.';
  end if;

  if v_plan.kind = 'debt' and v_tx.type <> 'expense' then
    raise exception 'transaction_type_not_supported'
      using errcode = 'P0001',
            hint = 'Loan plans can only link expense transactions.';
  end if;

  if v_tx.date::date < v_plan.start_date or v_tx.date::date > v_plan.end_date then
    raise exception 'transaction_outside_plan_period'
      using errcode = 'P0001',
            hint = 'Linked transactions must fall within the plan period.';
  end if;

  if v_plan.group_id is not null then
    if v_tx.group_id is distinct from v_plan.group_id then
      raise exception 'group_scope_mismatch'
        using errcode = 'P0001',
              hint = 'Plan and transaction must share the same group scope.';
    end if;
  elsif v_tx.user_id <> v_plan.user_id or v_tx.group_id is not null then
    raise exception 'private_scope_mismatch'
      using errcode = 'P0001',
            hint = 'Private plans can only link to private transactions owned by the plan owner.';
  end if;

  if exists (
    select 1 from public.plan_transaction_links
    where transaction_id = p_transaction_id
      and plan_id <> p_plan_id
  ) then
    raise exception 'transaction_already_linked'
      using errcode = 'P0001',
            hint = 'Unlink from the other plan first.';
  end if;

  insert into public.plan_transaction_links (plan_id, transaction_id, created_by)
  values (p_plan_id, p_transaction_id, auth.uid())
  on conflict (plan_id, transaction_id) do update
    set created_at = public.plan_transaction_links.created_at
  returning * into v_link;

  return v_link;
end;
$$;
