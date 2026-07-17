-- P0-3B: reject settlement on non-active plans; lock linked tx date/scope post-link.
-- Historical links on refinanced/closed plans are kept for payment history.
-- Date/scope orphan links are removed (corrupt invariant).

-- ---------------------------------------------------------------------------
-- 1. Unlink date/scope orphans
-- ---------------------------------------------------------------------------
delete from public.plan_transaction_links l
using public.plans p, public.transactions t
where l.plan_id = p.id
  and l.transaction_id = t.id
  and (
    t.date::date < p.start_date
    or t.date::date > p.end_date
    or (
      p.group_id is not null
      and t.group_id is distinct from p.group_id
    )
    or (
      p.group_id is null
      and (t.user_id <> p.user_id or t.group_id is not null)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Shared scope predicate (mirrors link_plan_transaction)
-- ---------------------------------------------------------------------------
create or replace function public.transaction_matches_plan_scope(
  p_plan public.plans,
  p_tx public.transactions
)
returns boolean
language sql
immutable
as $$
  select case
    when p_plan.group_id is not null then
      p_tx.group_id is not distinct from p_plan.group_id
    else
      p_tx.user_id = p_plan.user_id and p_tx.group_id is null
  end;
$$;

comment on function public.transaction_matches_plan_scope(public.plans, public.transactions) is
  'True when transaction private/group scope matches the plan.';

revoke all on function public.transaction_matches_plan_scope(public.plans, public.transactions)
  from public, anon;
grant execute on function public.transaction_matches_plan_scope(public.plans, public.transactions)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. link_plan_transaction — require status = active
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
  return v_link;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. add_plan_contribution — require status = active
-- ---------------------------------------------------------------------------
create or replace function public.add_plan_contribution(
  p_plan_id uuid,
  p_amount numeric,
  p_date date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans;
  v_category_id uuid;
  v_transaction_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_date is null then raise exception 'invalid_date' using errcode = 'P0001'; end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if v_plan is null or v_plan.kind <> 'save' then
    raise exception 'save_plan_not_found' using errcode = 'P0001';
  end if;
  if v_plan.status is distinct from 'active' then
    raise exception 'plan_not_active' using errcode = 'P0001';
  end if;
  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;
  if p_date < v_plan.start_date or p_date > v_plan.end_date then
    raise exception 'transaction_outside_plan_period' using errcode = 'P0001';
  end if;

  perform public.seed_default_categories(v_uid);
  select id into v_category_id from public.categories
  where user_id = v_uid and name = 'Cele' and type = 'expense'
  order by created_at limit 1;
  if v_category_id is null then raise exception 'goal_category_missing' using errcode = 'P0001'; end if;

  insert into public.transactions (
    amount, currency, description, date, type, status, category_id, user_id, group_id
  ) values (
    p_amount, 'PLN', coalesce(nullif(btrim(p_description), ''), 'Wpłata na cel'),
    p_date::timestamptz, 'expense', 'paid', v_category_id, v_uid, v_plan.group_id
  ) returning id into v_transaction_id;

  perform public.link_plan_transaction(p_plan_id, v_transaction_id);
  return v_transaction_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Post-link date / group_id lock
-- ---------------------------------------------------------------------------
create or replace function public.lock_linked_transaction_plan_invariants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
begin
  if old.date is not distinct from new.date
     and old.group_id is not distinct from new.group_id then
    return new;
  end if;

  select p.* into v_plan
  from public.plan_transaction_links l
  join public.plans p on p.id = l.plan_id
  where l.transaction_id = new.id
  limit 1;

  if v_plan is null then
    return new;
  end if;

  if new.date::date < v_plan.start_date or new.date::date > v_plan.end_date then
    raise exception 'transaction_outside_plan_period' using errcode = 'P0001';
  end if;

  if not public.transaction_matches_plan_scope(v_plan, new) then
    if v_plan.group_id is not null then
      raise exception 'group_scope_mismatch' using errcode = 'P0001';
    else
      raise exception 'private_scope_mismatch' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lock_linked_transaction_plan_invariants on public.transactions;
create trigger lock_linked_transaction_plan_invariants
  before update of date, group_id
  on public.transactions
  for each row
  execute function public.lock_linked_transaction_plan_invariants();

comment on function public.lock_linked_transaction_plan_invariants() is
  'Rejects date/group_id edits that would violate the linked plan period or scope.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.link_plan_transaction(uuid, uuid) from public, anon;
revoke all on function public.add_plan_contribution(uuid, numeric, date, text) from public, anon;
grant execute on function public.link_plan_transaction(uuid, uuid) to authenticated;
grant execute on function public.add_plan_contribution(uuid, numeric, date, text) to authenticated;
