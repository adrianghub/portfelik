-- P0-2C: atomic recurring series mutations (skip, end, materialize, prune, bulk delete).

-- ---------------------------------------------------------------------------
-- Shared authorization + prune helpers (SECURITY INVOKER — RLS applies)
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_transaction_actor(
  p_owner_id uuid,
  p_group_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    (p_group_id is null and p_owner_id = auth.uid())
    or (
      p_group_id is not null
      and (
        (p_owner_id = auth.uid() and public.is_group_member(p_group_id))
        or public.is_group_co_owner(p_group_id)
      )
    );
$$;

comment on function public.can_manage_transaction_actor(uuid, uuid) is
  'Mirrors client canManageTransaction: private owner; group creator while member; owner/co-owner.';

create or replace function public._prune_recurring_occurrences_from(
  p_template_id uuid,
  p_from_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.transactions t
  where t.recurring_template_id = p_template_id
    and t.recurring_occurrence_date >= p_from_date
    and t.status = 'upcoming';

  update public.transactions t
  set
    recurring_template_id = null,
    recurring_occurrence_date = null,
    updated_at = now()
  where t.recurring_template_id = p_template_id
    and t.recurring_occurrence_date >= p_from_date
    and t.status in ('paid', 'draft', 'overdue');
end;
$$;

-- ---------------------------------------------------------------------------
-- skip_recurring_occurrence — skip memory + optional row delete (one transaction)
-- ---------------------------------------------------------------------------
create or replace function public.skip_recurring_occurrence(
  p_template_id uuid,
  p_occurrence_date date,
  p_transaction_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.transactions;
  v_tx public.transactions;
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

  if p_transaction_id is not null then
    select * into v_tx from public.transactions where id = p_transaction_id;
    if v_tx is null then
      raise exception 'transaction_not_found' using errcode = 'P0001';
    end if;
    if v_tx.recurring_template_id is distinct from p_template_id
       or v_tx.recurring_occurrence_date is distinct from p_occurrence_date then
      raise exception 'occurrence_mismatch' using errcode = 'P0001';
    end if;
    if not public.can_manage_transaction_actor(v_tx.user_id, v_tx.group_id) then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;
  elsif not public.can_manage_transaction_actor(v_template.user_id, v_template.group_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.recurring_occurrence_skips (
    user_id,
    group_id,
    recurring_template_id,
    occurrence_date,
    skipped_transaction_id,
    created_by
  ) values (
    coalesce(v_tx.user_id, v_template.user_id),
    coalesce(v_tx.group_id, v_template.group_id),
    p_template_id,
    p_occurrence_date,
    p_transaction_id,
    v_actor
  )
  on conflict (recurring_template_id, occurrence_date) do nothing;

  if p_transaction_id is not null then
    delete from public.transactions where id = p_transaction_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- end_recurring_series_from_occurrence — end date + prune policy (one transaction)
-- ---------------------------------------------------------------------------
create or replace function public.end_recurring_series_from_occurrence(
  p_template_id uuid,
  p_occurrence_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.transactions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_template
  from public.transactions
  where id = p_template_id;
  if v_template is null or not v_template.is_recurring then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  if not public.can_manage_transaction_actor(v_template.user_id, v_template.group_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update public.transactions
  set recurrence_end_date = p_occurrence_date - 1,
      updated_at = now()
  where id = p_template_id;

  perform public._prune_recurring_occurrences_from(p_template_id, p_occurrence_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- prune_recurring_occurrences_from — shorten end date without moving template end
-- ---------------------------------------------------------------------------
create or replace function public.prune_recurring_occurrences_from(
  p_template_id uuid,
  p_from_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.transactions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_template
  from public.transactions
  where id = p_template_id;
  if v_template is null or not v_template.is_recurring then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  if not public.can_manage_transaction_actor(v_template.user_id, v_template.group_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  perform public._prune_recurring_occurrences_from(p_template_id, p_from_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- materialize_recurring_occurrence — upsert logical slot + return id
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
-- bulk_delete_transactions — per-row skip memory + delete (one transaction)
-- ---------------------------------------------------------------------------
create or replace function public.bulk_delete_transactions(
  p_transaction_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_tx public.transactions;
  v_deleted integer := 0;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_transaction_ids is null or cardinality(p_transaction_ids) = 0 then
    return 0;
  end if;

  foreach v_id in array p_transaction_ids loop
    select * into v_tx from public.transactions where id = v_id;
    if not found then
      continue;
    end if;
    if not public.can_manage_transaction_actor(v_tx.user_id, v_tx.group_id) then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;

    if v_tx.recurring_template_id is not null
       and v_tx.recurring_occurrence_date is not null then
      insert into public.recurring_occurrence_skips (
        user_id,
        group_id,
        recurring_template_id,
        occurrence_date,
        skipped_transaction_id,
        created_by
      ) values (
        v_tx.user_id,
        v_tx.group_id,
        v_tx.recurring_template_id,
        v_tx.recurring_occurrence_date,
        v_tx.id,
        v_actor
      )
      on conflict (recurring_template_id, occurrence_date) do nothing;
    end if;

    delete from public.transactions where id = v_id;
    v_deleted := v_deleted + 1;
  end loop;

  return v_deleted;
end;
$$;

revoke all on function public.can_manage_transaction_actor(uuid, uuid) from public, anon;
revoke all on function public._prune_recurring_occurrences_from(uuid, date) from public, anon;
revoke all on function public.skip_recurring_occurrence(uuid, date, uuid) from public, anon;
revoke all on function public.end_recurring_series_from_occurrence(uuid, date) from public, anon;
revoke all on function public.prune_recurring_occurrences_from(uuid, date) from public, anon;
revoke all on function public.materialize_recurring_occurrence(uuid, date) from public, anon;
revoke all on function public.bulk_delete_transactions(uuid[]) from public, anon;

grant execute on function public.can_manage_transaction_actor(uuid, uuid) to authenticated, service_role;
grant execute on function public.skip_recurring_occurrence(uuid, date, uuid) to authenticated, service_role;
grant execute on function public.end_recurring_series_from_occurrence(uuid, date) to authenticated, service_role;
grant execute on function public.prune_recurring_occurrences_from(uuid, date) to authenticated, service_role;
grant execute on function public.materialize_recurring_occurrence(uuid, date) to authenticated, service_role;
grant execute on function public.bulk_delete_transactions(uuid[]) to authenticated, service_role;
