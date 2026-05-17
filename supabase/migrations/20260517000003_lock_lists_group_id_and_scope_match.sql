-- Phase 12 — Groups feature hardening (round 2): apply transaction-level
-- protections to shopping_lists, plus close attach-scope-mismatch hole,
-- plus require ≥1 item before complete/attach.
--
-- Audit findings from 2026-05-17 review:
--   P1: shopping_lists allow any owner to insert with any group_id, and
--       update lets any group member move a list to another group. Same
--       class of bug as transactions had before 20260517000000.
--   P1/P2: attach_shopping_list_to_transaction lets a list and tx with
--       different sharing scopes be linked (private + group, group A +
--       group B). Should require matching group_id.
--   New product rule: shopping list must have ≥1 item before complete
--       or attach.

-- ============================================================
-- 1. Lock shopping_lists.user_id immutable + restrict group_id
-- ============================================================

revoke update on table shopping_lists from authenticated;

grant update (
  name,
  status,
  group_id,
  category_id,
  total_amount,
  completed_at,
  updated_at
) on table shopping_lists to authenticated;

comment on column shopping_lists.user_id is
  'Immutable from client (column-level GRANT excludes user_id). Set on insert; never changes.';

create or replace function enforce_list_group_id_owner_only()
  returns trigger
  language plpgsql
  security invoker
as $$
begin
  if new.group_id is distinct from old.group_id and old.user_id <> auth.uid() then
    raise exception 'only_owner_can_change_group_id'
      using errcode = 'P0001',
            hint = 'Only the list''s creator can move it to or from a group.';
  end if;
  return new;
end;
$$;

drop trigger if exists list_group_id_owner_only on shopping_lists;
create trigger list_group_id_owner_only
  before update of group_id on shopping_lists
  for each row
  execute function enforce_list_group_id_owner_only();

comment on trigger list_group_id_owner_only on shopping_lists is
  'Only the row owner (user_id = auth.uid()) may change group_id. Group members can edit other fields but not reassign sharing.';

-- ============================================================
-- 2. Tighten INSERT policy: enforce group membership at insert
-- ============================================================

drop policy if exists "shopping_lists: users insert own" on shopping_lists;

create policy "shopping_lists: users insert own"
  on shopping_lists for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (group_id is null or (select is_group_member(group_id)))
  );

-- ============================================================
-- 3. Patch complete_shopping_list: require ≥1 item
-- ============================================================

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

  if p_total_amount <= 0 then
    raise exception 'invalid_amount'
      using errcode = 'P0001', hint = 'total_amount must be greater than 0.';
  end if;

  select count(*) into v_item_count
    from shopping_list_items
    where shopping_list_id = p_list_id;
  if v_item_count = 0 then
    raise exception 'list_empty'
      using errcode = 'P0001',
            hint = 'Add at least one item before completing the list.';
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

  update shopping_lists
  set status       = 'completed',
      total_amount = p_total_amount,
      category_id  = p_category_id,
      updated_at   = now()
  where id = p_list_id;

  return v_transaction;
end;
$$;

-- ============================================================
-- 4. Patch attach_shopping_list_to_transaction:
--    reject scope mismatch + require ≥1 item
-- ============================================================

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
  if v_tx.shopping_list_id is not null and v_tx.shopping_list_id <> p_list_id then
    raise exception 'transaction_already_linked'
      using errcode = 'P0001',
            hint = 'Detach from the other shopping list first.';
  end if;

  -- Sharing-scope match: list and tx must live on the same visibility
  -- surface. Private list ↔ private tx, or group X list ↔ group X tx.
  -- We refuse to silently promote the tx into the list's group (that
  -- would require owner-of-tx rules and is the user's decision via
  -- the dialog) — caller fixes the scope first.
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
