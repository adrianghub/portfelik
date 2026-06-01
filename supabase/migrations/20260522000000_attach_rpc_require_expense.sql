-- P2 - defense-in-depth: attach_shopping_list_to_transaction must reject
-- non-expense transactions.
--
-- The UI picker already filters to type='expense' (fetchAttachableTransactions
-- in services/shopping-lists.ts), so this only matters for direct RPC callers.
-- Without it, a direct rpc() call can attach an income tx and mark the list
-- 'completed' with total_amount = income.amount - corrupting list / expense
-- reporting even though the row never represented a shopping purchase.
--
-- Body is otherwise identical to 20260517000003. Only change:
-- new 'transaction_not_expense' guard placed after ownership/auth checks
-- (don't leak existence/type to unauthorised callers) and before the
-- 'transaction_already_linked' guard.

create or replace function attach_shopping_list_to_transaction(
  p_list_id uuid,
  p_tx_id   uuid
)
  returns transactions
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_list       shopping_lists;
  v_tx         transactions;
  v_item_count int;
begin
  select * into v_list from shopping_lists where id = p_list_id;
  if v_list is null then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;
  if v_list.user_id <> auth.uid()
    and not (v_list.group_id is not null and is_group_member(v_list.group_id))
  then
    raise exception 'not_authorized_list' using errcode = 'P0001';
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
            hint = 'Add at least one item before attaching the list to a transaction.';
  end if;

  select * into v_tx from transactions where id = p_tx_id;
  if v_tx is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;
  if v_tx.user_id <> auth.uid()
    and not (v_tx.group_id is not null and is_group_member(v_tx.group_id))
  then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;

  if v_tx.type <> 'expense' then
    raise exception 'transaction_not_expense'
      using errcode = 'P0001',
            hint = 'Shopping lists track expenses; income transactions cannot be linked.';
  end if;

  if v_tx.shopping_list_id is not null and v_tx.shopping_list_id <> p_list_id then
    raise exception 'transaction_already_linked'
      using errcode = 'P0001',
            hint = 'Detach from the other shopping list first.';
  end if;

  -- Sharing-scope match: list and tx must live on the same visibility
  -- surface. Private list ↔ private tx, or group X list ↔ group X tx.
  -- We refuse to silently promote the tx into the list's group (that
  -- would require owner-of-tx rules and is the user's decision via
  -- the dialog) - caller fixes the scope first.
  if v_list.group_id is distinct from v_tx.group_id then
    raise exception 'sharing_scope_mismatch'
      using errcode = 'P0001',
            hint = 'List and transaction must share the same group (or both be private).';
  end if;

  update transactions
  set
    shopping_list_id = p_list_id,
    category_id      = coalesce(v_list.category_id, category_id),
    updated_at       = now()
  where id = p_tx_id
  returning * into v_tx;

  update shopping_lists
  set
    status       = 'completed',
    total_amount = v_tx.amount,
    category_id  = coalesce(v_list.category_id, v_tx.category_id),
    completed_at = now(),
    updated_at   = now()
  where id = p_list_id;

  return v_tx;
end;
$$;

comment on function attach_shopping_list_to_transaction(uuid, uuid) is
  'Mark a shopping list as completed by linking it to an existing expense transaction. Tx adopts the list category. Raises if either is not authorised, the tx is income (transaction_not_expense), the tx is already linked elsewhere, or sharing scopes do not match.';
