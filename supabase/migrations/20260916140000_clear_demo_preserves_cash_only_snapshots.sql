-- Demo seed never writes financial_snapshots. Clearing showcase rows must not
-- treat an empty item list as proof the snapshot is demo-owned: a cash-only
-- save still stores as_of_date plus the cash_positions anchor.

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

  delete from public.notifications n
  where n.user_id = v_uid
    and n.data is not null
    and (
      n.data ->> 'templateId' in (
        select t.id::text
        from public.transactions t
        where t.user_id = v_uid
          and t.is_demo
      )
      or n.data ->> 'transactionId' in (
        select t.id::text
        from public.transactions t
        where t.user_id = v_uid
          and (
            t.is_demo
            or t.recurring_template_id in (
              select d.id
              from public.transactions d
              where d.user_id = v_uid
                and d.is_demo
            )
          )
      )
    );

  -- Plans first so debt terms and settlement links disappear through their FKs.
  with deleted as (
    delete from public.plans
    where user_id = v_uid
      and is_demo
    returning id
  )
  select count(*)::int into v_plans from deleted;

  -- Untagged cron occurrences of demo templates, then the tagged showcase rows.
  with demo_templates as (
    select id
    from public.transactions
    where user_id = v_uid
      and is_demo
  ),
  deleted as (
    delete from public.transactions
    where user_id = v_uid
      and (
        is_demo
        or recurring_template_id in (select id from demo_templates)
      )
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
  'Atomically deletes every tagged showcase row owned by the caller, plus untagged occurrences and matching reminders. Real cash-only net-worth snapshots are left intact.';

revoke all on function public.clear_demo_data() from public, anon;
grant execute on function public.clear_demo_data() to authenticated;
