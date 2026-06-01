-- Phase 12 - Groups feature: explicit transaction sharing
--
-- Today: any group member transparently sees any other member's transactions
--        (RLS "transactions: users read group-shared" - implicit, all-or-nothing).
-- After: transactions must be explicitly assigned to a group via group_id to be
--        visible / writable to its members. Default group_id = NULL → owner-only.
--
-- Also: shopping_lists already has explicit group_id (initial schema).
-- Also: disband_group now blocks if any list or transaction still references
--       the group, forcing the owner to unassign or delete shared items first.

alter table transactions
  add column group_id uuid references user_groups(id) on delete set null;

comment on column transactions.group_id is
  'When set, all members of the referenced group can read and write this transaction. NULL = owner-private.';

-- FK-covering partial index (skips owner-private rows)
create index if not exists transactions_group_id_idx
  on transactions(group_id) where group_id is not null;

-- Refresh the transactions_with_category view to pick up the new column.
-- PG views freeze t.* column list at create time. Since recurring_template_id
-- (added 2026-04-26) and now group_id shift the column order vs the original
-- view, `create or replace view` rejects the change ("cannot change name of
-- view column"). Drop + recreate is required. No external dependencies.
drop view if exists transactions_with_category;

create view transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type
  from transactions t
  join categories   c on c.id = t.category_id;

comment on view transactions_with_category is
  'Transactions joined with category name and type. SECURITY INVOKER - caller RLS applies.';

-- Replace implicit cross-member visibility with explicit group_id check
drop policy if exists "transactions: users read group-shared" on transactions;
drop policy if exists "transactions: users read own"          on transactions;
drop policy if exists "transactions: users insert own"        on transactions;
drop policy if exists "transactions: users update own"        on transactions;
drop policy if exists "transactions: users delete own"        on transactions;

create policy "transactions: select own or group"
  on transactions for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and is_group_member(group_id))
  );

create policy "transactions: insert own"
  on transactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (group_id is null or is_group_member(group_id))
  );

create policy "transactions: update own or group"
  on transactions for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and is_group_member(group_id))
  )
  with check (
    user_id = (select auth.uid())
    or (group_id is not null and is_group_member(group_id))
  );

create policy "transactions: delete own or group"
  on transactions for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and is_group_member(group_id))
  );

-- Block disband when group has shared items.
-- Surfaces P0001 'group_has_items' so the UI can render a translated message.
create or replace function disband_group(p_group_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count_lists int;
  v_count_txs   int;
begin
  if not exists (
    select 1 from user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  select count(*) into v_count_lists from shopping_lists where group_id = p_group_id;
  select count(*) into v_count_txs   from transactions   where group_id = p_group_id;

  if v_count_lists > 0 or v_count_txs > 0 then
    raise exception 'group_has_items'
      using errcode = 'P0001',
            hint = format('%s shopping list(s), %s transaction(s) still reference this group', v_count_lists, v_count_txs);
  end if;

  delete from user_groups where id = p_group_id;
end;
$$;

comment on function disband_group(uuid) is
  'Disband a group. Blocks (raises group_has_items) if any shopping_lists or transactions still reference it. Owner must unassign or delete shared items first.';
