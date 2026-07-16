-- P0-4C: sync debt current_balance inside link/unlink RPCs (atomic with settle).
-- Ports TS liveBalance / reanchorWithPayment. Does not mutate snapshot anchors.
-- SECURITY DEFINER so group members who can settle can also refresh the cache
-- (direct plan_debt_terms UPDATE is owner/co-owner only).

create or replace function public.sync_debt_current_balance_from_links(p_plan_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
  v_terms public.plan_debt_terms;
  v_as_of date := public.product_local_date();
  v_balance numeric;
  v_snap_date date;
  v_pay record;
  v_days int;
  v_interest numeric;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null or v_plan.kind is distinct from 'debt' then
    return null;
  end if;

  select * into v_terms from public.plan_debt_terms where plan_id = p_plan_id;
  if v_terms is null then
    return null;
  end if;

  if v_terms.anchor_balance is not null and v_terms.balance_anchor_date is not null then
    v_balance := greatest(0, v_terms.anchor_balance);
    v_snap_date := v_terms.balance_anchor_date;
  else
    v_balance := greatest(0, v_terms.original_amount);
    v_snap_date := v_plan.start_date;
  end if;

  for v_pay in
    select t.date::date as pay_date, abs(t.amount) as pay_amount
    from public.plan_transaction_links l
    join public.transactions t on t.id = l.transaction_id
    where l.plan_id = p_plan_id
      and t.type = 'expense'
      and t.date::date > v_snap_date
      and t.date::date <= v_as_of
    order by t.date::date asc, t.id asc
  loop
    v_days := greatest(0, (v_pay.pay_date - v_snap_date));
    v_interest := case
      when v_terms.annual_rate > 0
        then v_balance * (v_terms.annual_rate / 100.0 / 365.0) * v_days
      else 0
    end;
    v_balance := greatest(0, v_balance + v_interest - v_pay.pay_amount);
    v_balance := round(v_balance, 2);
    v_snap_date := v_pay.pay_date;
    if v_balance <= 0.01 then
      v_balance := 0;
      exit;
    end if;
  end loop;

  v_balance := round(v_balance, 2);
  if v_balance > v_terms.original_amount then
    v_balance := v_terms.original_amount;
  end if;

  update public.plan_debt_terms
  set current_balance = v_balance,
      updated_at = now()
  where plan_id = p_plan_id;

  return v_balance;
end;
$$;

comment on function public.sync_debt_current_balance_from_links(uuid) is
  'Replays linked expense payments into plan_debt_terms.current_balance (liveBalance).';

revoke all on function public.sync_debt_current_balance_from_links(uuid)
  from public, anon;
-- Callable by authenticated for tests/manual sync; writers also call from link/unlink.
grant execute on function public.sync_debt_current_balance_from_links(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- link_plan_transaction — sync debt balance after insert
-- ---------------------------------------------------------------------------
create or replace function public.link_plan_transaction(
  p_plan_id uuid,
  p_transaction_id uuid
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
  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
  if v_plan.status is distinct from 'active' then
    raise exception 'plan_not_active' using errcode = 'P0001';
  end if;
  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx is null then raise exception 'transaction_not_found' using errcode = 'P0001'; end if;
  if not public.can_access_transaction_for_settlement(v_tx) then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;
  if v_tx.type <> 'expense' then
    raise exception 'transaction_must_be_expense' using errcode = 'P0001';
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
  if exists (
    select 1 from public.plan_transaction_links
    where transaction_id = p_transaction_id and plan_id <> p_plan_id
  ) then raise exception 'transaction_already_linked' using errcode = 'P0001'; end if;

  insert into public.plan_transaction_links (plan_id, transaction_id, created_by)
  values (p_plan_id, p_transaction_id, auth.uid())
  on conflict (plan_id, transaction_id) do update
    set created_at = public.plan_transaction_links.created_at
  returning * into v_link;

  if v_plan.kind = 'debt' then
    perform public.sync_debt_current_balance_from_links(p_plan_id);
  end if;

  return v_link;
end;
$$;

-- ---------------------------------------------------------------------------
-- unlink_plan_transaction — sync debt balance after delete
-- ---------------------------------------------------------------------------
create or replace function public.unlink_plan_transaction(
  p_plan_id uuid,
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then raise exception 'plan_not_found' using errcode = 'P0001'; end if;

  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  delete from public.plan_transaction_links
  where plan_id = p_plan_id
    and transaction_id = p_transaction_id;

  if not found then raise exception 'link_not_found' using errcode = 'P0001'; end if;

  if v_plan.kind = 'debt' then
    perform public.sync_debt_current_balance_from_links(p_plan_id);
  end if;
end;
$$;

revoke all on function public.link_plan_transaction(uuid, uuid) from public, anon;
revoke all on function public.unlink_plan_transaction(uuid, uuid) from public, anon;
grant execute on function public.link_plan_transaction(uuid, uuid) to authenticated;
grant execute on function public.unlink_plan_transaction(uuid, uuid) to authenticated;
