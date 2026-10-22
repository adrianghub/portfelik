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

  -- Prefixes are a warning, never authority to delete. An operator/user must
  -- first confirm the exact historical record and its origin, then tag it.
  if exists (select 1 from public.plans where user_id = v_uid and not is_demo and name = 'Demo: Kredyt samochodowy') then
    raise exception 'demo_legacy_origin_unconfirmed';
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

-- Sample ledger rows retain the production import provenance. This receipt
-- records only the cash anchor created by the sample, never a pre-existing one.
create table public.demo_sample_receipts (
  session_id uuid primary key references public.transaction_import_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cash_position_id uuid,
  cash_updated_at timestamptz,
  cleared_at timestamptz
);
alter table public.demo_sample_receipts enable row level security;
create policy "demo_sample_receipts: read own" on public.demo_sample_receipts
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.demo_sample_receipts from public, anon, authenticated;
grant select on public.demo_sample_receipts to authenticated;

create function public.finish_demo_sample(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cash public.cash_positions;
  v_count int;
  v_income numeric;
  v_expense numeric;
begin
  if v_uid is null or not public.is_demo_account(v_uid) then
    raise exception 'demo_account_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('demo-sample:' || v_uid::text, 0));
  perform 1 from public.transaction_import_sessions s
    where s.id = p_session_id and s.user_id = v_uid and s.status = 'committed'
      and s.source_file_hash = '9f0c0c3d843c27587b30654f594dad709062a53e82c76ca3af2e7ac3cd120c55'
    for update;
  if not found then raise exception 'demo_sample_session_invalid'; end if;
  select count(*), coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
    into v_count, v_income, v_expense
    from public.transaction_import_links l join public.transactions t on t.id = l.transaction_id
    where l.session_id = p_session_id and l.user_id = v_uid
      and t.user_id = v_uid and t.group_id is null and t.currency = 'PLN';
  if v_count <> 96 or v_income <> 61500 or v_expense <> 36765.84 then
    raise exception 'demo_sample_incomplete';
  end if;
  if exists (select 1 from public.demo_sample_receipts where session_id = p_session_id and cleared_at is not null) then
    raise exception 'demo_sample_already_cleared';
  end if;
  if not exists (select 1 from public.demo_sample_receipts where session_id = p_session_id) then
    insert into public.cash_positions(owner_id, opening_amount, as_of_date, balance_semantics)
      values (v_uid, 5000, date '2026-05-01', 'start_of_day')
      on conflict (owner_id) do nothing returning * into v_cash;
    insert into public.demo_sample_receipts(session_id, user_id, cash_position_id, cash_updated_at)
      values(p_session_id, v_uid, v_cash.id, v_cash.updated_at);
  end if;
  update public.transactions t set is_demo = true
    from public.transaction_import_links l
    where t.id = l.transaction_id and t.user_id = v_uid and t.group_id is null
      and l.user_id = v_uid and l.session_id = p_session_id;
  return jsonb_build_object('total', v_count);
end;
$$;
revoke all on function public.finish_demo_sample(uuid) from public, anon;
grant execute on function public.finish_demo_sample(uuid) to authenticated;

-- Kept separate from ordinary debt editing: the demo tag is present at INSERT,
-- and the existing validating debt RPC and the INSERT share one transaction.
create function public.create_demo_car_loan(p_start_date date, p_end_date date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_plan_id uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.plans(user_id, name, kind, target_amount, start_date, end_date, is_demo)
    values(auth.uid(), 'Kredyt samochodowy', 'debt', 42000, p_start_date, p_end_date, true)
    returning id into v_plan_id;
  v_result := public.save_debt_plan(v_plan_id, 'Kredyt samochodowy', null, null,
    p_start_date, p_end_date, 42000, 42000, 38500, 7.5, 980,
    p_start_date, null, false, false);
  return v_result;
end;
$$;
revoke all on function public.create_demo_car_loan(date,date) from public, anon;
grant execute on function public.create_demo_car_loan(date,date) to authenticated;

create function public.clear_demo_sample()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_legacy jsonb;
  v_txs int := 0;
begin
  if v_uid is null or not public.is_demo_account(v_uid) then
    raise exception 'demo_account_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('demo-sample:' || v_uid::text, 0));
  -- Lock the sessions also used by commit_import_session before deleting rows.
  perform 1 from public.transaction_import_sessions s where s.user_id = v_uid
    and s.source_file_hash = '9f0c0c3d843c27587b30654f594dad709062a53e82c76ca3af2e7ac3cd120c55'
    order by s.id for update;
  if exists (select 1 from public.transaction_import_sessions s where s.user_id = v_uid
    and s.source_file_hash = '9f0c0c3d843c27587b30654f594dad709062a53e82c76ca3af2e7ac3cd120c55'
    and s.status = 'preview') then
    raise exception 'demo_sample_import_in_progress';
  end if;
  -- A plan created by the user or a shared transaction is not sample-owned.
  if exists (
    select 1 from public.transaction_import_links l
    join public.transactions t on t.id = l.transaction_id
    where l.user_id = v_uid and t.user_id = v_uid
      and l.source_file_hash = '9f0c0c3d843c27587b30654f594dad709062a53e82c76ca3af2e7ac3cd120c55'
      and (t.group_id is not null or exists (
        select 1 from public.plan_transaction_links pl join public.plans p on p.id = pl.plan_id
          where pl.transaction_id = t.id and not p.is_demo
      ))
  ) then raise exception 'demo_sample_has_user_links'; end if;
  -- This also refuses unconfirmed historical Demo: records, before any DELETE.
  v_legacy := public.clear_demo_data();
  with deleted as (
    delete from public.transactions t using public.transaction_import_links l
    where t.id = l.transaction_id and t.user_id = v_uid and t.group_id is null
      and l.user_id = v_uid
      and l.source_file_hash = '9f0c0c3d843c27587b30654f594dad709062a53e82c76ca3af2e7ac3cd120c55'
    returning t.id
  ) select count(*) into v_txs from deleted;
  delete from public.cash_positions c using public.demo_sample_receipts r
    where r.user_id = v_uid and r.cleared_at is null and c.owner_id = v_uid
      and c.group_id is null and c.id = r.cash_position_id
      and c.updated_at = r.cash_updated_at
      and not exists (select 1 from public.transactions t where t.user_id = v_uid);
  update public.demo_sample_receipts set cleared_at = now()
    where user_id = v_uid and cleared_at is null;
  return jsonb_build_object('deleted', coalesce((v_legacy->>'deleted')::int, 0) + v_txs);
end;
$$;
revoke all on function public.clear_demo_sample() from public, anon;
grant execute on function public.clear_demo_sample() to authenticated;
