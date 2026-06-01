-- Phase 12 - Groups feature hardening
--
-- complete_shopping_list inserts the expense transaction without
-- copying the list's group_id. After the 2026-05-16 explicit-sharing
-- migration, this means a completed group-shared list produces an
-- expense that only the completing user can see - silently dropping
-- visibility for the rest of the group.
--
-- Fix: copy v_list.group_id onto the new transaction so it inherits
-- the same sharing surface as the source list.

create or replace function complete_shopping_list(
  p_list_id      uuid,
  p_total_amount numeric,
  p_category_id  uuid
)
  returns transactions
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_list        shopping_lists;
  v_transaction transactions;
begin
  select * into v_list from shopping_lists where id = p_list_id;

  if v_list is null then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;

  -- Authorisation: owner or group member
  if v_list.user_id != auth.uid()
    and not (
      v_list.group_id is not null
      and exists (
        select 1 from group_members
        where group_id = v_list.group_id
          and user_id  = auth.uid()
      )
    )
  then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_list.status = 'completed' then
    raise exception 'list_already_completed' using errcode = 'P0001';
  end if;

  if p_total_amount <= 0 then
    raise exception 'invalid_amount'
      using errcode = 'P0001', hint = 'total_amount must be greater than 0.';
  end if;

  -- Create linked expense transaction. Propagate group_id so the
  -- generated tx is visible to the same group as the source list.
  insert into transactions (
    amount, currency, description, date, type, status,
    category_id, user_id, shopping_list_id, group_id
  )
  values (
    p_total_amount,
    'PLN',
    v_list.name,
    now(),
    'expense',
    'paid',
    p_category_id,
    auth.uid(),
    p_list_id,
    v_list.group_id
  )
  returning * into v_transaction;

  -- Mark list as completed
  update shopping_lists
  set status       = 'completed',
      total_amount = p_total_amount,
      category_id  = p_category_id,
      updated_at   = now()
  where id = p_list_id;

  return v_transaction;
end;
$$;
