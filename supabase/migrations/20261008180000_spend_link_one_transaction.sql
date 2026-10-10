-- Two callers can pass the existence check together. The transaction unique
-- index still allows only one plan, and that race uses the same domain error
-- as a sequential second link.

create or replace function public.link_plan_transaction(
  p_plan_id uuid,
  p_transaction_id uuid,
  p_plan_item_id uuid default null
)
returns public.plan_transaction_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
  v_tx public.transactions;
  v_link public.plan_transaction_links;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if v_plan is null then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
  if v_plan.status is distinct from 'active' then
    raise exception 'plan_not_active' using errcode = 'P0001';
  end if;
  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  if v_plan.kind = 'debt' then
    perform 1 from public.plan_debt_terms where plan_id = p_plan_id for update;
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if v_tx is null then raise exception 'transaction_not_found' using errcode = 'P0001'; end if;
  if not public.can_access_transaction_for_settlement(v_tx) then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;
  if v_tx.type <> 'expense' then
    raise exception 'transaction_must_be_expense' using errcode = 'P0001';
  end if;
  if v_plan.kind = 'debt' and v_tx.status is distinct from 'paid' then
    raise exception 'debt_link_requires_paid' using errcode = 'P0001';
  end if;

  if v_plan.kind = 'spend' then
    if p_plan_item_id is null then
      raise exception 'spend_link_requires_item' using errcode = 'P0001';
    end if;
    if v_tx.status is distinct from 'paid' then
      raise exception 'spend_link_requires_paid' using errcode = 'P0001';
    end if;
    if v_plan.group_id is null then
      if not public.transaction_matches_plan_scope(v_plan, v_tx) then
        raise exception 'private_scope_mismatch' using errcode = 'P0001';
      end if;
    elsif not (
      v_tx.group_id is not distinct from v_plan.group_id
      or (v_tx.group_id is null and v_tx.user_id = (select auth.uid()))
    ) then
      raise exception 'group_scope_mismatch' using errcode = 'P0001';
    end if;
  else
    if p_plan_item_id is not null then
      raise exception 'plan_item_only_for_spend' using errcode = 'P0001';
    end if;
    if v_tx.date::date < v_plan.start_date or v_tx.date::date > v_plan.end_date then
      raise exception 'transaction_outside_plan_period' using errcode = 'P0001';
    end if;
    if not public.transaction_matches_plan_scope(v_plan, v_tx) then
      if v_plan.group_id is not null then
        raise exception 'group_scope_mismatch' using errcode = 'P0001';
      else
        raise exception 'private_scope_mismatch' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.plan_transaction_links
    where transaction_id = p_transaction_id and plan_id <> p_plan_id
  ) then raise exception 'transaction_already_linked' using errcode = 'P0001'; end if;

  begin
    insert into public.plan_transaction_links (plan_id, transaction_id, plan_item_id, created_by)
    values (p_plan_id, p_transaction_id, p_plan_item_id, auth.uid())
    on conflict (plan_id, transaction_id) do update
      set plan_item_id = excluded.plan_item_id
    returning * into v_link;
  exception
    when unique_violation then
      raise exception 'transaction_already_linked' using errcode = 'P0001';
  end;

  if v_plan.kind = 'debt' then
    perform public._sync_debt_current_balance_from_links(p_plan_id);
  end if;

  return v_link;
end;
$$;

