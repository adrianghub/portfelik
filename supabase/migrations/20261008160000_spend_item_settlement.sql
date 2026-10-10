-- A spend line is paid only by linked transactions. One transaction settles
-- one plan and at most one line. A shared trip may use the caller's private
-- payment without exposing that account's other history.

alter table public.plan_transaction_links
  add column plan_item_id uuid references public.plan_items(id) on delete cascade;

comment on column public.plan_transaction_links.plan_item_id is
  'Spend lines only. Save and debt links stay plan-level. Deleting the line removes its settlement links.';

create index plan_transaction_links_plan_item_id_idx
  on public.plan_transaction_links(plan_item_id)
  where plan_item_id is not null;

create or replace function public.plan_transaction_links_check_item()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind text;
  v_item_plan uuid;
  v_item_status text;
begin
  select kind into v_kind from public.plans where id = new.plan_id;
  if v_kind = 'spend' then
    if new.plan_item_id is null then
      raise exception 'spend_link_requires_item' using errcode = 'P0001';
    end if;
    select plan_id, status into v_item_plan, v_item_status
    from public.plan_items
    where id = new.plan_item_id;
    if v_item_plan is distinct from new.plan_id then
      raise exception 'plan_item_mismatch' using errcode = 'P0001';
    end if;
    if v_item_status = 'cancelled' then
      raise exception 'plan_item_cancelled' using errcode = 'P0001';
    end if;
  elsif new.plan_item_id is not null then
    raise exception 'plan_item_only_for_spend' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger plan_transaction_links_check_item
  before insert or update of plan_id, plan_item_id
  on public.plan_transaction_links
  for each row
  execute function public.plan_transaction_links_check_item();

-- A deposit can precede the trip. A private payment on a shared spend plan
-- stays compatible when the plan dates change.
create or replace function public.plan_links_compatible_with(
  p_plan_id uuid,
  p_user_id uuid,
  p_group_id uuid,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.plan_transaction_links l
    join public.transactions t on t.id = l.transaction_id
    join public.plans p on p.id = l.plan_id
    where l.plan_id = p_plan_id
      and (
        (
          p.kind is distinct from 'spend'
          and (t.date::date < p_start_date or t.date::date > p_end_date)
        )
        or (
          p_group_id is not null
          and not (
            t.group_id is not distinct from p_group_id
            or (p.kind = 'spend' and t.group_id is null)
          )
        )
        or (
          p_group_id is null
          and (t.user_id <> p_user_id or t.group_id is not null)
        )
      )
  );
$$;

drop function public.link_plan_transaction(uuid, uuid);

create function public.link_plan_transaction(
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

  insert into public.plan_transaction_links (plan_id, transaction_id, plan_item_id, created_by)
  values (p_plan_id, p_transaction_id, p_plan_item_id, auth.uid())
  on conflict (plan_id, transaction_id) do update
    set plan_item_id = excluded.plan_item_id
  returning * into v_link;

  if v_plan.kind = 'debt' then
    perform public._sync_debt_current_balance_from_links(p_plan_id);
  end if;

  return v_link;
end;
$$;

revoke all on function public.link_plan_transaction(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_plan_transaction(uuid, uuid, uuid) to authenticated;

comment on function public.link_plan_transaction(uuid, uuid, uuid) is
  'Links one expense to one plan. Spend requires a line. A shared spend plan may link the caller''s private payment.';

create or replace function public.list_spend_item_settlements(p_plan_id uuid)
returns table (
  link_id uuid,
  plan_item_id uuid,
  transaction_id uuid,
  amount numeric,
  paid_on date,
  counts_as_paid boolean,
  description text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;
  if v_plan.kind is distinct from 'spend' then
    raise exception 'plan_item_requires_spend' using errcode = 'P0001';
  end if;

  return query
  select
    l.id,
    l.plan_item_id,
    l.transaction_id,
    t.amount,
    t.date::date,
    t.status = 'paid',
    case
      when public.can_access_transaction_for_settlement(t) then t.description
      else null
    end
  from public.plan_transaction_links l
  join public.transactions t on t.id = l.transaction_id
  where l.plan_id = p_plan_id
    and l.plan_item_id is not null
  order by t.date, l.created_at;
end;
$$;

revoke all on function public.list_spend_item_settlements(uuid) from public, anon;
grant execute on function public.list_spend_item_settlements(uuid) to authenticated;

comment on function public.list_spend_item_settlements(uuid) is
  'Settlement facts for a spend plan. Amounts are visible to plan members. A private transaction description is visible only to someone who can read that transaction.';
