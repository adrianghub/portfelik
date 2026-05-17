-- Phase 12 — connect existing transaction to a shopping list.
--
-- Today: completing a list creates a new transaction. With the bank-CSV
-- import feature coming, users will often already have a transaction
-- from the bank and just want to attach a shopping list to it.
--
-- This RPC marks the list as completed and points the existing tx at it
-- (transactions.shopping_list_id). The tx adopts the list's category so
-- the connection feels like the list's metadata applied to the tx.

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
  v_list shopping_lists;
  v_tx   transactions;
begin
  -- Load list and verify caller can update it.
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

  -- Load tx and verify caller can update it.
  select * into v_tx from transactions where id = p_tx_id;
  if v_tx is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;
  if v_tx.user_id <> auth.uid()
    and not (v_tx.group_id is not null and is_group_member(v_tx.group_id))
  then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;
  if v_tx.shopping_list_id is not null and v_tx.shopping_list_id <> p_list_id then
    raise exception 'transaction_already_linked'
      using errcode = 'P0001',
            hint = 'Detach from the other shopping list first.';
  end if;

  -- Adopt list metadata onto the transaction.
  update transactions
  set
    shopping_list_id = p_list_id,
    category_id      = coalesce(v_list.category_id, category_id),
    updated_at       = now()
  where id = p_tx_id
  returning * into v_tx;

  -- Mark list completed, copy tx amount so it shows on the card.
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
  'Mark a shopping list as completed by linking it to an existing transaction. Tx adopts the list category. Raises if either is not authorised or the tx is already linked elsewhere.';
