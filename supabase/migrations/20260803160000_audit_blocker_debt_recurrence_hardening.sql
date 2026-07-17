-- Audit blocker remediation (2026-07-16):
-- 1) Authorize + lock debt balance sync; count only paid expenses.
-- 2) Require paid status on debt settlement links; resync on amount/status edits.
-- 3) Reject plan date/scope updates that would orphan existing links.
-- 4) Validate materialize slots against cadence + skip memory.
-- 5) Atomic create-and-link for manual settle-from-dialog.
-- 6) Serialize ownership transfer and enforce a single owner role.

-- ---------------------------------------------------------------------------
-- 1. Debt balance sync — internal replay + authorized public wrapper
-- ---------------------------------------------------------------------------
create or replace function public._sync_debt_current_balance_from_links(p_plan_id uuid)
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
  select * into v_plan
  from public.plans
  where id = p_plan_id
  for update;

  if v_plan is null or v_plan.kind is distinct from 'debt' then
    return null;
  end if;

  select * into v_terms
  from public.plan_debt_terms
  where plan_id = p_plan_id
  for update;

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
      and t.status = 'paid'
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

revoke all on function public._sync_debt_current_balance_from_links(uuid)
  from public, anon, authenticated;
grant execute on function public._sync_debt_current_balance_from_links(uuid)
  to service_role;

create or replace function public.sync_debt_current_balance_from_links(p_plan_id uuid)
returns numeric
language plpgsql
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
  if v_plan is null or v_plan.kind is distinct from 'debt' then
    return null;
  end if;

  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  return public._sync_debt_current_balance_from_links(p_plan_id);
end;
$$;

comment on function public.sync_debt_current_balance_from_links(uuid) is
  'Authorized entry: replays paid linked expenses into current_balance. Locks plan+terms via internal helper.';

-- ---------------------------------------------------------------------------
-- 2. link / unlink — lock rows; debt links require paid status
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
    perform public._sync_debt_current_balance_from_links(p_plan_id);
  end if;

  return v_link;
end;
$$;

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

  select * into v_plan from public.plans where id = p_plan_id for update;
  if v_plan is null then raise exception 'plan_not_found' using errcode = 'P0001'; end if;

  if not public.can_access_plan_for_settlement(v_plan) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  if v_plan.kind = 'debt' then
    perform 1 from public.plan_debt_terms where plan_id = p_plan_id for update;
  end if;

  delete from public.plan_transaction_links
  where plan_id = p_plan_id
    and transaction_id = p_transaction_id;

  if not found then raise exception 'link_not_found' using errcode = 'P0001'; end if;

  if v_plan.kind = 'debt' then
    perform public._sync_debt_current_balance_from_links(p_plan_id);
  end if;
end;
$$;

-- Resync debt cache when a linked expense amount/status changes.
create or replace function public.resync_debt_on_linked_tx_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  if tg_op = 'UPDATE'
     and old.amount is not distinct from new.amount
     and old.status is not distinct from new.status then
    return new;
  end if;

  for v_plan_id in
    select l.plan_id
    from public.plan_transaction_links l
    join public.plans p on p.id = l.plan_id
    where l.transaction_id = new.id
      and p.kind = 'debt'
  loop
    perform public._sync_debt_current_balance_from_links(v_plan_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists resync_debt_on_linked_tx_change on public.transactions;
create trigger resync_debt_on_linked_tx_change
  after update of amount, status
  on public.transactions
  for each row
  execute function public.resync_debt_on_linked_tx_change();

-- ---------------------------------------------------------------------------
-- 3. Plan link invariants on date/scope change (debt RPC + all plans trigger)
-- ---------------------------------------------------------------------------
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
    where l.plan_id = p_plan_id
      and (
        t.date::date < p_start_date
        or t.date::date > p_end_date
        or (
          p_group_id is not null
          and t.group_id is distinct from p_group_id
        )
        or (
          p_group_id is null
          and (t.user_id <> p_user_id or t.group_id is not null)
        )
      )
  );
$$;

revoke all on function public.plan_links_compatible_with(uuid, uuid, uuid, date, date)
  from public, anon;
grant execute on function public.plan_links_compatible_with(uuid, uuid, uuid, date, date)
  to authenticated, service_role;

create or replace function public.save_debt_plan(
  p_plan_id              uuid,
  p_name                 text,
  p_group_id             uuid,
  p_category_id          uuid,
  p_start_date           date,
  p_end_date             date,
  p_target_amount        numeric,
  p_original_amount      numeric,
  p_current_balance      numeric,
  p_annual_rate          numeric,
  p_monthly_payment      numeric,
  p_first_payment_date   date,
  p_first_payment_amount numeric,
  p_reset_balance_anchor boolean default false,
  p_clear_balance_anchor boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_original numeric;
  v_balance numeric;
  v_rate numeric;
  v_payment numeric;
  v_plan public.plans;
  v_terms public.plan_debt_terms;
  v_existing public.plan_debt_terms;
  v_anchor_balance numeric;
  v_anchor_date date;
  v_target numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'date_required' using errcode = 'P0001';
  end if;

  if p_end_date < p_start_date then
    raise exception 'date_order' using errcode = 'P0001';
  end if;

  v_original := abs(coalesce(p_original_amount, 0));
  v_payment := abs(coalesce(p_monthly_payment, 0));
  v_rate := coalesce(p_annual_rate, 0);
  v_balance := abs(
    case
      when p_current_balance is null or p_current_balance <> p_current_balance then v_original
      else p_current_balance
    end
  );

  if v_original <= 0 then
    raise exception 'debt_original_required' using errcode = 'P0001';
  end if;
  if v_payment <= 0 then
    raise exception 'debt_payment_required' using errcode = 'P0001';
  end if;
  if v_rate < 0 then
    raise exception 'debt_rate_invalid' using errcode = 'P0001';
  end if;
  if v_balance > v_original then
    raise exception 'debt_balance_exceeds_original' using errcode = 'P0001';
  end if;

  v_target := case
    when p_target_amount is not null and p_target_amount > 0 then abs(p_target_amount)
    else v_original
  end;

  if p_plan_id is not null then
    select * into v_plan
    from public.plans
    where id = p_plan_id and kind = 'debt'
    for update;

    if v_plan is null then
      raise exception 'plan_not_found' using errcode = 'P0001';
    end if;

    if v_plan.status is distinct from 'active' then
      raise exception 'plan_not_active' using errcode = 'P0001';
    end if;

    if not public.plan_links_compatible_with(
      p_plan_id,
      v_plan.user_id,
      p_group_id,
      p_start_date,
      p_end_date
    ) then
      raise exception 'linked_transactions_incompatible' using errcode = 'P0001';
    end if;

    select * into v_existing
    from public.plan_debt_terms
    where plan_id = p_plan_id
    for update;
  end if;

  if p_clear_balance_anchor then
    v_anchor_balance := null;
    v_anchor_date := null;
  elsif p_reset_balance_anchor then
    v_anchor_balance := v_balance;
    v_anchor_date := public.product_local_date();
  elsif v_existing.plan_id is not null then
    v_anchor_balance := v_existing.anchor_balance;
    v_anchor_date := v_existing.balance_anchor_date;
  else
    v_anchor_balance := v_balance;
    v_anchor_date := public.product_local_date();
  end if;

  if p_plan_id is null then
    insert into public.plans (
      name, user_id, group_id, category_id, kind, target_amount,
      start_date, end_date, status
    ) values (
      v_name, v_uid, p_group_id, p_category_id, 'debt', v_target,
      p_start_date, p_end_date, 'active'
    )
    returning * into v_plan;

    insert into public.plan_debt_terms (
      plan_id, original_amount, current_balance, annual_rate, monthly_payment,
      anchor_balance, balance_anchor_date, first_payment_date, first_payment_amount
    ) values (
      v_plan.id, v_original, v_balance, v_rate, v_payment,
      v_anchor_balance, v_anchor_date, p_first_payment_date, p_first_payment_amount
    )
    returning * into v_terms;
  else
    update public.plans set
      name = v_name,
      group_id = p_group_id,
      category_id = p_category_id,
      target_amount = v_target,
      start_date = p_start_date,
      end_date = p_end_date,
      updated_at = now()
    where id = p_plan_id
    returning * into v_plan;

    insert into public.plan_debt_terms (
      plan_id, original_amount, current_balance, annual_rate, monthly_payment,
      anchor_balance, balance_anchor_date, first_payment_date, first_payment_amount
    ) values (
      p_plan_id, v_original, v_balance, v_rate, v_payment,
      v_anchor_balance, v_anchor_date, p_first_payment_date, p_first_payment_amount
    )
    on conflict (plan_id) do update set
      original_amount = excluded.original_amount,
      current_balance = excluded.current_balance,
      annual_rate = excluded.annual_rate,
      monthly_payment = excluded.monthly_payment,
      anchor_balance = excluded.anchor_balance,
      balance_anchor_date = excluded.balance_anchor_date,
      first_payment_date = excluded.first_payment_date,
      first_payment_amount = excluded.first_payment_amount,
      updated_at = now()
    returning * into v_terms;
  end if;

  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'terms', to_jsonb(v_terms)
  );
end;
$$;

create or replace function public.reject_plan_update_breaking_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.start_date is not distinct from new.start_date
     and old.end_date is not distinct from new.end_date
     and old.group_id is not distinct from new.group_id then
    return new;
  end if;

  if not public.plan_links_compatible_with(
    new.id,
    new.user_id,
    new.group_id,
    new.start_date,
    new.end_date
  ) then
    raise exception 'linked_transactions_incompatible' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_plan_update_breaking_links on public.plans;
create trigger reject_plan_update_breaking_links
  before update of start_date, end_date, group_id
  on public.plans
  for each row
  execute function public.reject_plan_update_breaking_links();

-- ---------------------------------------------------------------------------
-- 4. materialize_recurring_occurrence — validate cadence + skips
-- ---------------------------------------------------------------------------
create or replace function public.materialize_recurring_occurrence(
  p_template_id uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.transactions;
  v_row_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_template
  from public.transactions
  where id = p_template_id;
  if v_template is null or not v_template.is_recurring then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;

  if v_template.group_id is null then
    if v_template.user_id <> v_actor then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;
  elsif not public.is_group_member(v_template.group_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_template.recurrence_frequency is null then
    raise exception 'invalid_occurrence_date' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.recurring_occurrence_skips s
    where s.recurring_template_id = p_template_id
      and s.occurrence_date = p_occurrence_date
  ) then
    raise exception 'occurrence_skipped' using errcode = 'P0001';
  end if;

  if not public.recurring_occurrence_on_date(
    v_template.date::date,
    v_template.recurrence_frequency,
    coalesce(v_template.recurrence_interval, 1),
    v_template.recurrence_weekday,
    v_template.recurrence_month,
    v_template.recurring_day,
    p_occurrence_date,
    v_template.recurrence_end_date
  ) then
    raise exception 'invalid_occurrence_date' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    amount, currency, counterparty, description, date, type, status,
    category_id, user_id, group_id,
    is_recurring, recurring_day,
    recurrence_frequency, recurrence_interval, recurrence_weekday, recurrence_month,
    recurring_template_id, recurring_occurrence_date
  ) values (
    abs(v_template.amount), v_template.currency, v_template.counterparty, v_template.description,
    p_occurrence_date::timestamptz, v_template.type, 'upcoming',
    v_template.category_id, v_actor, v_template.group_id,
    false, null, null, 1, null, null,
    p_template_id, p_occurrence_date
  )
  on conflict on constraint transactions_recurring_occurrence_logical_unique do nothing
  returning id into v_row_id;

  if v_row_id is null then
    select t.id into v_row_id
    from public.transactions t
    where t.recurring_template_id = p_template_id
      and t.recurring_occurrence_date = p_occurrence_date;
  end if;

  if v_row_id is null then
    raise exception 'materialize_failed' using errcode = 'P0001';
  end if;

  return v_row_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. create_and_link_plan_transaction — atomic manual settle create
-- ---------------------------------------------------------------------------
create or replace function public.create_and_link_plan_transaction(
  p_plan_id uuid,
  p_amount numeric,
  p_description text,
  p_date date,
  p_category_id uuid,
  p_currency text default 'PLN',
  p_counterparty text default null,
  p_status text default 'paid',
  p_group_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tx_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  if p_category_id is null then
    raise exception 'category_required' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    amount, currency, counterparty, description, date, type, status,
    category_id, user_id, group_id
  ) values (
    abs(p_amount),
    coalesce(nullif(btrim(p_currency), ''), 'PLN'),
    nullif(btrim(p_counterparty), ''),
    coalesce(nullif(btrim(p_description), ''), 'Transakcja'),
    p_date::timestamptz,
    'expense',
    coalesce(p_status, 'paid'),
    p_category_id,
    v_actor,
    p_group_id
  )
  returning id into v_tx_id;

  perform public.link_plan_transaction(p_plan_id, v_tx_id);
  return v_tx_id;
end;
$$;

comment on function public.create_and_link_plan_transaction(
  uuid, numeric, text, date, uuid, text, text, text, uuid
) is
  'Creates an expense and links it to a plan in one transaction (rolls back on link failure).';

revoke all on function public.create_and_link_plan_transaction(
  uuid, numeric, text, date, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.create_and_link_plan_transaction(
  uuid, numeric, text, date, uuid, text, text, text, uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. transfer_group_ownership — lock + single owner role
-- ---------------------------------------------------------------------------
create or replace function public.transfer_group_ownership(
  p_group_id     uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  perform 1
  from public.user_groups
  where id = p_group_id
    and owner_id = v_caller_id
  for update;

  if not found then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id  = p_new_owner_id
  ) then
    raise exception 'new_owner_not_member'
      using errcode = 'P0001',
            hint    = 'The new owner must already be a member of the group.';
  end if;

  update public.group_members
  set role = 'member'
  where group_id = p_group_id
    and role = 'owner';

  update public.group_members
  set role = 'owner'
  where group_id = p_group_id
    and user_id  = p_new_owner_id;

  update public.user_groups
  set owner_id   = p_new_owner_id,
      updated_at = now()
  where id = p_group_id;
end;
$$;
