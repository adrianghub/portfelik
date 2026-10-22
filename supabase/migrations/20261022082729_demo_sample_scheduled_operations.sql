-- Fixed history remains the pinned 96-row bank import. Three unpaid operations
-- demonstrate the existing forecast with dates relative to the fill day.
-- Preserve receipt RLS/grants: only the owner can read; no direct client writes.
alter table public.demo_sample_receipts
  add column scheduled_transaction_ids uuid[] not null default array[]::uuid[],
  add column scenario_initialized_at timestamptz;

create or replace function public.finish_demo_sample(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cash public.cash_positions;
  v_count int;
  v_income numeric;
  v_expense numeric;
  v_operation record;
  v_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_category uuid;
  v_today date := public.product_local_date();
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
  -- The receipt and operation IDs are server-owned provenance. A retry never
  -- duplicates or resurrects operations the demo user has edited or removed.
  if exists (select 1 from public.demo_sample_receipts
    where session_id = p_session_id and scenario_initialized_at is null) then
    for v_operation in select * from (values
      ('Przykład: Zaległy rachunek za internet', 120::numeric, 'expense', 'overdue', -1, 'Mieszkanie'),
      ('Przykład: Ubezpieczenie samochodu', 450::numeric, 'expense', 'upcoming', 3, 'Transport'),
      ('Przykład: Zwrot za wspólny wyjazd', 2500::numeric, 'income', 'upcoming', 5, 'Zwrot')
    ) as x(description, amount, kind, status, offset_days, category_name) loop
      select t.category_id into v_category
        from public.transaction_import_links l
        join public.transactions t on t.id = l.transaction_id
        join public.categories c on c.id = t.category_id
        where l.session_id = p_session_id and l.user_id = v_uid and t.user_id = v_uid
          and t.type::text = v_operation.kind and c.archived_at is null
        order by (c.name = v_operation.category_name) desc, t.id limit 1;
      if v_category is null then raise exception 'demo_sample_category_missing'; end if;
      insert into public.transactions(user_id, amount, currency, description, date, type, status, category_id, is_demo)
        values(v_uid, v_operation.amount, 'PLN', v_operation.description,
          ((v_today + v_operation.offset_days) + time '12:00') at time zone 'Europe/Warsaw',
          v_operation.kind::public.transaction_type, v_operation.status::public.transaction_status, v_category, true)
        returning id into v_id;
      v_ids := array_append(v_ids, v_id);
    end loop;
    update public.demo_sample_receipts set scheduled_transaction_ids = v_ids, scenario_initialized_at = now()
      where session_id = p_session_id and user_id = v_uid;
  end if;
  return jsonb_build_object('total', v_count, 'scheduled', 3);
end;
$$;
revoke all on function public.finish_demo_sample(uuid) from public, anon;
grant execute on function public.finish_demo_sample(uuid) to authenticated;


create or replace function public.clear_demo_sample()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_legacy jsonb;
  v_txs int := 0;
  v_scheduled int := 0;
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
  if exists (
    select 1 from public.demo_sample_receipts r
    join public.transactions t on t.id = any(r.scheduled_transaction_ids)
    where r.user_id = v_uid and t.user_id = v_uid and r.cleared_at is null
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
  with deleted as (
    delete from public.transactions t using public.demo_sample_receipts r
    where r.user_id = v_uid and r.cleared_at is null and t.user_id = v_uid
      and t.group_id is null and t.id = any(r.scheduled_transaction_ids)
    returning t.id
  ) select count(*) into v_scheduled from deleted;
  delete from public.cash_positions c using public.demo_sample_receipts r
    where r.user_id = v_uid and r.cleared_at is null and c.owner_id = v_uid
      and c.group_id is null and c.id = r.cash_position_id
      and c.updated_at = r.cash_updated_at
      and not exists (select 1 from public.transactions t where t.user_id = v_uid);
  update public.demo_sample_receipts set cleared_at = now()
    where user_id = v_uid and cleared_at is null;
  return jsonb_build_object('deleted', coalesce((v_legacy->>'deleted')::int, 0) + v_txs + v_scheduled);
end;
$$;
revoke all on function public.clear_demo_sample() from public, anon;
grant execute on function public.clear_demo_sample() to authenticated;
