-- Phase 13 — Shopping Lists: Intent-Oriented modes.
--
-- Adds two columns that turn the implicit "active vs completed" lifecycle
-- into the explicit Planning / Shopping / Done flow described in
-- docs/product/intent-oriented-ui.md and the shopping-lists refactor plan.
--
--   planned_for         : when the user intends to shop. Drives the
--                         Upcoming vs Active bucket on the index.
--   shopping_started_at : set when the user taps "Start shopping". Drives
--                         the Planning vs Shopping mode on the detail page.
--                         Cleared by "Back to planning".
--
-- The existing `status` enum and `completed_at` (set by the
-- `set_completed_at` trigger and the `complete_shopping_list` RPC) stay
-- authoritative for the Done bucket. Buckets/modes are derived in the
-- client; the duplicate RPC is refreshed below so an archived list duplicates
-- into a fresh Planning list for today.

-- ============================================================
-- 1. Columns
-- ============================================================

alter table shopping_lists
  add column if not exists planned_for date not null default current_date;

alter table shopping_lists
  add column if not exists shopping_started_at timestamptz;

comment on column shopping_lists.planned_for is
  'Date the user intends to shop. Defaults to current_date on insert. Lists with planned_for > current_date and shopping_started_at IS NULL surface in the Upcoming bucket on the index.';

comment on column shopping_lists.shopping_started_at is
  'Set when the user explicitly enters Shopping mode (Start shopping button); NULL means Planning mode. Cleared by Back to planning. The list is Done once completed_at is set (independent of this field).';

-- ============================================================
-- 2. Backfill shopping_started_at for active lists that already
--    look like they were being shopped (at least one checked item).
-- ============================================================

update shopping_lists sl
set shopping_started_at = sl.created_at
where sl.shopping_started_at is null
  and sl.status = 'active'
  and exists (
    select 1
    from shopping_list_items i
    where i.shopping_list_id = sl.id
      and i.completed = true
  );

-- ============================================================
-- 3. UPDATE grants — let owners/members write the new columns
--    through PostgREST. user_id stays excluded (column-level grant
--    enforces the existing immutability invariant).
-- ============================================================

revoke update on table shopping_lists from authenticated;

grant update (
  name,
  status,
  group_id,
  category_id,
  total_amount,
  completed_at,
  planned_for,
  shopping_started_at,
  updated_at
) on table shopping_lists to authenticated;

-- ============================================================
-- 4. Indexes — both columns are used to bucket the index page.
-- ============================================================

create index if not exists idx_shopping_lists_planned_for
  on shopping_lists (planned_for)
  where status = 'active' and shopping_started_at is null;

create index if not exists idx_shopping_lists_shopping_started_at
  on shopping_lists (shopping_started_at)
  where status = 'active' and shopping_started_at is not null;

-- ============================================================
-- 5. Duplicate RPC — duplicate into today's Planning mode.
-- ============================================================

create or replace function duplicate_shopping_list(p_list_id uuid)
returns shopping_lists
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source shopping_lists;
  v_new_list shopping_lists;
begin
  select * into v_source from shopping_lists where id = p_list_id;
  if not found then
    raise exception 'shopping_list_not_found';
  end if;

  insert into shopping_lists (
    name,
    status,
    user_id,
    group_id,
    category_id,
    planned_for,
    shopping_started_at
  )
  values (
    v_source.name || ' (kopia)',
    'active',
    auth.uid(),
    v_source.group_id,
    v_source.category_id,
    current_date,
    null
  )
  returning * into v_new_list;

  insert into shopping_list_items (
    shopping_list_id,
    name,
    completed,
    quantity,
    unit,
    category,
    position
  )
  select
    v_new_list.id,
    name,
    false,
    quantity,
    unit,
    category,
    position
  from shopping_list_items
  where shopping_list_id = p_list_id
  order by position;

  return v_new_list;
end;
$$;

grant execute on function duplicate_shopping_list(uuid) to authenticated;
