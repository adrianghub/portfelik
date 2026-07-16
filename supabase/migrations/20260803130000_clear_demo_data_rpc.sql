-- P0-4 leftovers: atomic clear of Demo:-prefixed rows for the caller.
-- Seed stays client-side; clear is transactional so partial wipe cannot strand data.

create or replace function public.clear_demo_data()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text := 'Demo:%';
  v_plans int := 0;
  v_txs int := 0;
  v_items int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Plans first (cascades debt terms + settlement links).
  with deleted as (
    delete from public.plans
    where user_id = v_uid
      and name like v_prefix
    returning id
  )
  select count(*)::int into v_plans from deleted;

  with deleted as (
    delete from public.transactions
    where user_id = v_uid
      and description like v_prefix
    returning id
  )
  select count(*)::int into v_txs from deleted;

  with deleted as (
    delete from public.net_worth_items
    where user_id = v_uid
      and label like v_prefix
    returning id
  )
  select count(*)::int into v_items from deleted;

  return jsonb_build_object(
    'plans', v_plans,
    'transactions', v_txs,
    'net_worth_items', v_items,
    'deleted', v_plans + v_txs + v_items
  );
end;
$$;

comment on function public.clear_demo_data() is
  'Atomically deletes the caller''s Demo:-prefixed plans, transactions, and net-worth items.';

revoke all on function public.clear_demo_data() from public, anon;
grant execute on function public.clear_demo_data() to authenticated;
