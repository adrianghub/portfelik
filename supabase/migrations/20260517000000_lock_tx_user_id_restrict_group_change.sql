-- Phase 12 - Groups feature hardening
--
-- Two issues with the explicit-sharing model shipped in
-- 20260516000000_transactions_group_id.sql:
--
-- 1. UPDATE policy's WITH CHECK allows the *new* user_id to be anyone
--    matching the policy condition. A malicious group member could
--    rewrite user_id to themselves and steal a peer's transaction.
-- 2. Same policy allows moving a transaction into a different group
--    the caller belongs to - i.e. re-sharing someone else's row.
--
-- Postgres RLS WITH CHECK only sees NEW row values; it cannot reference
-- OLD. Two-pronged fix:
--   a) Strip table-level UPDATE from authenticated, then GRANT UPDATE
--      per editable column EXCEPT user_id. This is the same pattern as
--      profiles.role (see 20260514000001) - column-level REVOKE alone
--      is silently ineffective when a broader table-level grant exists.
--   b) Trigger enforces group_id can only change when auth.uid() is the
--      row owner. Group members may CRUD a shared row but cannot
--      reassign its visibility.

-- 1a. Strip table-level UPDATE and re-grant per column (user_id excluded).
revoke update on table transactions from authenticated;

grant update (
  amount,
  currency,
  description,
  date,
  type,
  status,
  category_id,
  shopping_list_id,
  is_recurring,
  recurring_day,
  recurring_template_id,
  group_id,
  updated_at
) on table transactions to authenticated;

comment on column transactions.user_id is
  'Immutable from client (column-level GRANT excludes user_id). Set on insert; never changes.';

-- 1b. Trigger: only owner may change group_id. Group members can update
-- amount/description/category/etc. but not the sharing target.
create or replace function enforce_tx_group_id_owner_only()
  returns trigger
  language plpgsql
  security invoker
as $$
begin
  if new.group_id is distinct from old.group_id and old.user_id <> auth.uid() then
    raise exception 'only_owner_can_change_group_id'
      using errcode = 'P0001',
            hint = 'Only the transaction''s creator can move it to or from a group.';
  end if;
  return new;
end;
$$;

drop trigger if exists tx_group_id_owner_only on transactions;
create trigger tx_group_id_owner_only
  before update of group_id on transactions
  for each row
  execute function enforce_tx_group_id_owner_only();

comment on trigger tx_group_id_owner_only on transactions is
  'Only the row owner (user_id = auth.uid()) may change group_id. Group members can edit other fields but not reassign sharing.';
