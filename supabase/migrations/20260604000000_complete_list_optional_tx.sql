-- Make the expense transaction optional when completing a shopping list.
--
-- Previously `complete_shopping_list` always inserted a linked expense
-- transaction. The product now lets the user opt out (e.g. cash spend already
-- tracked elsewhere, or completion without recording a spend). A new
-- `p_create_transaction` flag (default true) preserves existing call sites.
--
-- When the flag is false: the list is still marked completed and may record an
-- optional total/category for display, but no transaction row is created and
-- the function returns NULL. When true: behaviour is identical to before
-- (amount must be > 0, transaction created, list archived).
--
-- The previous 3-arg signature is dropped so there is a single, unambiguous
-- function; the client always passes the flag after this migration.

drop function if exists complete_shopping_list(uuid, numeric, uuid);

create or replace function complete_shopping_list(
  p_list_id            uuid,
  p_total_amount       numeric,
  p_category_id        uuid,
  p_create_transaction boolean default true
)
  returns transactions
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_list        shopping_lists;
  v_transaction transactions;
  v_item_count  int;
begin
  select * into v_list from shopping_lists where id = p_list_id;

  if v_list is null then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;

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

  select count(*) into v_item_count
    from shopping_list_items
    where shopping_list_id = p_list_id;
  if v_item_count = 0 then
    raise exception 'list_empty'
      using errcode = 'P0001',
            hint = 'Add at least one item before completing the list.';
  end if;

  if p_create_transaction then
    if p_total_amount is null or p_total_amount <= 0 then
      raise exception 'invalid_amount'
        using errcode = 'P0001', hint = 'total_amount must be greater than 0.';
    end if;

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
  end if;

  update shopping_lists
  set status       = 'completed',
      total_amount = p_total_amount,
      category_id  = coalesce(p_category_id, category_id),
      updated_at   = now()
  where id = p_list_id;

  return v_transaction; -- NULL when no transaction was created
end;
$$;
