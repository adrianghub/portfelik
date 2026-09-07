-- clear_demo_data originally kept a Demo: prefix match for pre-flag rows.
-- Those rows were tagged by 20260906194928. Prefix matching must not remain:
-- a real transaction whose description starts with "Demo:" is user data.

create or replace function public.clear_demo_data()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plans int := 0;
  v_txs int := 0;
  v_items int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Plans first so debt terms and settlement links disappear through their FKs.
  with deleted as (
    delete from public.plans
    where user_id = v_uid
      and is_demo
    returning id
  )
  select count(*)::int into v_plans from deleted;

  with deleted as (
    delete from public.transactions
    where user_id = v_uid
      and is_demo
    returning id
  )
  select count(*)::int into v_txs from deleted;

  with deleted as (
    delete from public.net_worth_items
    where user_id = v_uid
      and is_demo
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
  'Atomically deletes every tagged showcase row owned by the caller. Human Demo: labels are not a cleanup key.';

revoke all on function public.clear_demo_data() from public, anon;
grant execute on function public.clear_demo_data() to authenticated;
