-- First-class Plans: replace shopping-list-backed plan storage.
--
-- Start-fresh cut:
-- - legacy shopping_lists/shopping_list_items rows are discarded
-- - existing plan_transaction_links rows are discarded
-- - plan settlement links point at public.plans
-- - transactions.shopping_list_id and list RPCs are removed

-- ---------------------------------------------------------------------------
-- 1. First-class plans table
-- ---------------------------------------------------------------------------
create table public.plans (
  id            uuid            primary key default gen_random_uuid(),
  name          text            not null,
  user_id       uuid            not null references auth.users(id) on delete cascade,
  group_id      uuid            references public.user_groups(id) on delete set null,
  category_id   uuid            references public.categories(id) on delete set null,
  budget_amount numeric(12, 2)  check (budget_amount is null or budget_amount > 0),
  start_date    date            not null,
  end_date      date            not null,
  created_at    timestamptz     not null default now(),
  updated_at    timestamptz     not null default now(),
  constraint plans_name_nonempty check (length(btrim(name)) > 0),
  constraint plans_date_order check (end_date >= start_date)
);

comment on table public.plans is
  'First-class user plans. Plans express intent; transactions remain financial truth.';
comment on column public.plans.budget_amount is
  'Optional planned budget. Progress is computed from linked transactions, not from plan rows.';
comment on column public.plans.start_date is 'Inclusive plan period start.';
comment on column public.plans.end_date is 'Inclusive plan period end.';

create trigger set_updated_at
  before update on public.plans
  for each row execute function public.handle_updated_at();

create index idx_plans_user_updated
  on public.plans(user_id, updated_at desc);
create index idx_plans_group_user_updated
  on public.plans(group_id, user_id, updated_at desc)
  where group_id is not null;
create index idx_plans_start_end
  on public.plans(start_date, end_date);

alter table public.plans enable row level security;

create policy "plans: select own or group"
  on public.plans for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_member(group_id)))
  );

create policy "plans: insert own"
  on public.plans for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (group_id is null or (select public.is_group_member(group_id)))
  );

create policy "plans: update own or group"
  on public.plans for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_member(group_id)))
  )
  with check (
    user_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_member(group_id)))
  );

create policy "plans: delete own or group"
  on public.plans for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_member(group_id)))
  );

grant select, insert, delete on table public.plans to authenticated;
grant update (
  name,
  group_id,
  category_id,
  budget_amount,
  start_date,
  end_date,
  updated_at
) on table public.plans to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Repoint settlement links to plans. Start fresh: no legacy links survive.
-- ---------------------------------------------------------------------------
truncate table public.plan_transaction_links;

alter table public.plan_transaction_links
  drop constraint if exists plan_transaction_links_plan_id_fkey;

alter table public.plan_transaction_links
  add constraint plan_transaction_links_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete cascade;

comment on table public.plan_transaction_links is
  'Plan settlement links. One transaction per plan in MVP+. RPC-write-only.';

drop policy if exists "plan_transaction_links: read when plan and tx visible"
  on public.plan_transaction_links;
drop policy if exists "plan_transaction_links: no direct writes"
  on public.plan_transaction_links;

create policy "plan_transaction_links: read when plan and tx visible"
  on public.plan_transaction_links for select
  to authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_transaction_links.plan_id
        and (
          p.user_id = (select auth.uid())
          or (p.group_id is not null and (select public.is_group_member(p.group_id)))
        )
    )
    and exists (
      select 1 from public.transactions t
      where t.id = plan_transaction_links.transaction_id
        and (
          t.user_id = (select auth.uid())
          or (t.group_id is not null and (select public.is_group_member(t.group_id)))
        )
    )
  );

create policy "plan_transaction_links: no direct writes"
  on public.plan_transaction_links for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 3. Settlement RPCs: plans + expense/income.
-- ---------------------------------------------------------------------------
create or replace function public.link_plan_transaction(
  p_plan_id        uuid,
  p_transaction_id uuid
)
  returns public.plan_transaction_links
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_plan public.plans;
  v_tx   public.transactions;
  v_link public.plan_transaction_links;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  if v_plan.user_id <> auth.uid()
    and not (v_plan.group_id is not null and public.is_group_member(v_plan.group_id))
  then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;

  if v_tx.user_id <> auth.uid()
    and not (v_tx.group_id is not null and public.is_group_member(v_tx.group_id))
  then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;

  if v_tx.type not in ('expense', 'income') then
    raise exception 'transaction_type_not_supported' using errcode = 'P0001';
  end if;

  if v_tx.date::date < v_plan.start_date or v_tx.date::date > v_plan.end_date then
    raise exception 'transaction_outside_plan_period'
      using errcode = 'P0001',
            hint = 'Linked transactions must fall within the plan period.';
  end if;

  if v_plan.group_id is not null then
    if v_tx.group_id is distinct from v_plan.group_id then
      raise exception 'group_scope_mismatch'
        using errcode = 'P0001',
              hint = 'Plan and transaction must share the same group scope.';
    end if;
  elsif v_tx.user_id <> v_plan.user_id or v_tx.group_id is not null then
    raise exception 'private_scope_mismatch'
      using errcode = 'P0001',
            hint = 'Private plans can only link to private transactions owned by the plan owner.';
  end if;

  if exists (
    select 1 from public.plan_transaction_links
    where transaction_id = p_transaction_id
      and plan_id <> p_plan_id
  ) then
    raise exception 'transaction_already_linked'
      using errcode = 'P0001',
            hint = 'Unlink from the other plan first.';
  end if;

  insert into public.plan_transaction_links (plan_id, transaction_id, created_by)
  values (p_plan_id, p_transaction_id, auth.uid())
  on conflict (plan_id, transaction_id) do update
    set created_at = public.plan_transaction_links.created_at
  returning * into v_link;

  return v_link;
end;
$$;

create or replace function public.unlink_plan_transaction(
  p_plan_id        uuid,
  p_transaction_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_plan public.plans;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  if v_plan.user_id <> auth.uid()
    and not (v_plan.group_id is not null and public.is_group_member(v_plan.group_id))
  then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  delete from public.plan_transaction_links
  where plan_id = p_plan_id
    and transaction_id = p_transaction_id;

  if not found then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.link_plan_transaction(uuid, uuid) from public, anon;
revoke all on function public.unlink_plan_transaction(uuid, uuid) from public, anon;
grant execute on function public.link_plan_transaction(uuid, uuid) to authenticated;
grant execute on function public.unlink_plan_transaction(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Group lifecycle: plans replace shopping_lists as shared group blockers.
-- ---------------------------------------------------------------------------
create or replace function public.disband_group(p_group_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count_plans int;
  v_count_txs   int;
begin
  if not exists (
    select 1 from public.user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  select count(*) into v_count_plans from public.plans where group_id = p_group_id;
  select count(*) into v_count_txs   from public.transactions where group_id = p_group_id;

  if v_count_plans > 0 or v_count_txs > 0 then
    raise exception 'group_has_items'
      using errcode = 'P0001',
            hint = format('%s plan(s), %s transaction(s) still reference this group', v_count_plans, v_count_txs);
  end if;

  delete from public.user_groups where id = p_group_id;
end;
$$;

grant execute on function public.disband_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Duplicate-warning indexes no longer key off shopping_list_id.
-- ---------------------------------------------------------------------------
drop index if exists public.idx_transactions_manual_duplicate_scan_user;
drop index if exists public.idx_transactions_manual_duplicate_scan_group;
drop index if exists public.idx_transactions_shopping_list_id;

create index if not exists idx_transactions_manual_duplicate_scan_user
  on public.transactions(user_id, type, amount, currency, date);

create index if not exists idx_transactions_manual_duplicate_scan_group
  on public.transactions(group_id, type, amount, currency, date)
  where group_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Drop legacy shopping/list functions before dropping their tables.
-- ---------------------------------------------------------------------------
drop function if exists public.complete_shopping_list(uuid, numeric, uuid);
drop function if exists public.complete_shopping_list(uuid, numeric, uuid, boolean);
drop function if exists public.attach_shopping_list_to_transaction(uuid, uuid);
drop function if exists public.duplicate_shopping_list(uuid);
drop trigger if exists list_group_id_owner_only on public.shopping_lists;
drop trigger if exists set_completed_at on public.shopping_lists;
drop function if exists public.enforce_list_group_id_owner_only();
drop function if exists public.set_shopping_list_completed_at();

-- ---------------------------------------------------------------------------
-- 7. Remove transactions.shopping_list_id. Recreate view because t.* freezes.
-- ---------------------------------------------------------------------------
drop view if exists public.transactions_with_category;

alter table public.transactions
  drop column if exists shopping_list_id;

create view public.transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type
  from public.transactions t
  join public.categories c on c.id = t.category_id;

comment on view public.transactions_with_category is
  'Transactions joined with category name and type. SECURITY INVOKER - caller RLS applies.';

grant select on table public.transactions_with_category to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 8. Drop legacy list/product storage.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime drop table public.shopping_list_items;

drop table if exists public.shopping_item_categories cascade;
drop table if exists public.shopping_list_items cascade;
drop table if exists public.shopping_lists cascade;
drop type if exists public.shopping_list_status;

-- ---------------------------------------------------------------------------
-- 9. Keep mark/preview duplicate scans executable after shopping_list_id drop.
--    Path B now means "plan-linked expense"; Path C means visible non-imported
--    transaction not already linked to a plan.
-- ---------------------------------------------------------------------------
create or replace function public.find_import_duplicate_warning(
  p_uid uuid,
  p_row public.transaction_import_rows,
  p_fingerprint text,
  p_exclude_tx_id uuid default null
)
returns table (
  duplicate_of_transaction_id uuid,
  duplicate_of_date date,
  duplicate_of_amount numeric(12, 2),
  duplicate_of_currency text,
  duplicate_of_description text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Path A: owner-scoped fingerprint scan through prior import links.
  return query
    select t.id, t.date::date, t.amount, t.currency::text, t.description
      from public.transaction_import_links l
      join public.transactions t on t.id = l.transaction_id
     where l.user_id = p_uid
       and l.fingerprint = p_fingerprint
       and (p_exclude_tx_id is null or l.transaction_id <> p_exclude_tx_id)
       and t.date::date between (p_row.posted_at - 3) and (p_row.posted_at + 3)
     order by t.date
     limit 1;
  if found then
    return;
  end if;

  -- Path B: plan-linked expense candidate visible to the caller.
  if p_row.type = 'expense' then
    return query
      select t.id, t.date::date, t.amount, t.currency::text, t.description
        from public.transactions t
       where t.type = 'expense'
         and exists (
           select 1 from public.plan_transaction_links l
           where l.transaction_id = t.id
         )
         and t.amount = p_row.amount
         and t.currency = p_row.currency
         and (p_exclude_tx_id is null or t.id <> p_exclude_tx_id)
         and t.date::date between (p_row.posted_at - 3) and (p_row.posted_at + 3)
         and (
              t.user_id = p_uid
           or (t.group_id is not null and public.is_group_member(t.group_id))
         )
       order by t.date
       limit 1;
    if found then
      return;
    end if;
  end if;

  -- Path C: visible non-imported transaction not already linked to a plan.
  return query
    select t.id, t.date::date, t.amount, t.currency::text, t.description
      from public.transactions t
      left join public.transaction_import_links l on l.transaction_id = t.id
     where t.type = p_row.type
       and l.transaction_id is null
       and not exists (
         select 1 from public.plan_transaction_links ptl
         where ptl.transaction_id = t.id
       )
       and t.amount = p_row.amount
       and t.currency = p_row.currency
       and (p_exclude_tx_id is null or t.id <> p_exclude_tx_id)
       and t.date::date between (p_row.posted_at - 1) and (p_row.posted_at + 1)
       and (
            t.user_id = p_uid
         or (t.group_id is not null and public.is_group_member(t.group_id))
       )
     order by t.date
     limit 1;
end;
$$;

revoke all on function public.find_import_duplicate_warning(uuid, public.transaction_import_rows, text, uuid)
  from public, anon, authenticated;

create or replace function public.preview_fingerprint_warnings(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_session         public.transaction_import_sessions;
  v_warnings        jsonb := '[]'::jsonb;
  v_row             public.transaction_import_rows;
  v_fp              text;
  v_dup_of          uuid;
  v_dup_date        date;
  v_dup_amount      numeric(12, 2);
  v_dup_currency    text;
  v_dup_description text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from public.transaction_import_sessions
   where id = p_session_id
     and user_id = v_uid;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  for v_row in
    select *
      from public.transaction_import_rows
     where session_id = p_session_id
     order by row_index
  loop
    v_fp := encode(
      extensions.digest(
        v_row.amount::text
        || '|' || v_row.currency
        || '|' || coalesce(v_row.description, '')
        || '|' || coalesce(v_row.counterparty, ''),
        'sha256'
      ),
      'hex'
    );

    v_dup_of := null;
    v_dup_date := null;
    v_dup_amount := null;
    v_dup_currency := null;
    v_dup_description := null;

    select
      duplicate_of_transaction_id,
      duplicate_of_date,
      duplicate_of_amount,
      duplicate_of_currency,
      duplicate_of_description
    into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
    from public.find_import_duplicate_warning(v_uid, v_row, v_fp, null)
    limit 1;

    if v_dup_of is not null then
      v_warnings := v_warnings || jsonb_build_object(
        'row_id',                       v_row.id,
        'duplicate_of_transaction_id',  v_dup_of,
        'duplicate_of_date',            v_dup_date,
        'duplicate_of_amount',          v_dup_amount,
        'duplicate_of_currency',        v_dup_currency,
        'duplicate_of_description',     v_dup_description
      );
    end if;
  end loop;

  return v_warnings;
end;
$$;

revoke all on function public.preview_fingerprint_warnings(uuid) from public;
grant execute on function public.preview_fingerprint_warnings(uuid) to authenticated;

comment on function public.preview_fingerprint_warnings(uuid) is
  'Bank import probable-duplicate scan. Path A: prior imported-link fingerprint match. '
  'Path B: plan-linked expense match (visible to caller, exact amount/currency, ±3 days). '
  'Path C: visible non-imported transaction not linked to a plan (exact type/amount/currency, ±1 day). '
  'Read-only; matches commit_import_session and mark_preview_duplicates warning semantics.';

create or replace function public.mark_preview_duplicates(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_session  transaction_import_sessions;
  v_warnings jsonb := '[]'::jsonb;
  v_row      transaction_import_rows;
  v_fp       text;
  v_dup_of   uuid;
  v_dup_date date;
  v_dup_amt  numeric(12,2);
  v_dup_cur  text;
  v_dup_desc text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from transaction_import_sessions
   where id = p_session_id
     and user_id = v_uid;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'preview' then
    raise exception 'session_not_in_preview_state'
      using errcode = 'P0001', detail = format('status=%s', v_session.status);
  end if;

  for v_row in
    select * from transaction_import_rows
    where session_id = p_session_id
    order by row_index
  loop
    v_fp := encode(
      extensions.digest(
        v_row.amount::text
        || '|' || v_row.currency
        || '|' || coalesce(v_row.description, '')
        || '|' || coalesce(v_row.counterparty, ''),
        'sha256'
      ),
      'hex'
    );

    v_dup_of := null;
    v_dup_date := null; v_dup_amt := null; v_dup_cur := null; v_dup_desc := null;

    select t.id, t.date::date, t.amount, t.currency, t.description
      into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
     order by t.date
     limit 1;

    if v_dup_of is null and v_row.type = 'expense' then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from transactions t
       where t.type = 'expense'
         and exists (
           select 1 from plan_transaction_links l
           where l.transaction_id = t.id
         )
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
       order by t.date
       limit 1;
    end if;

    if v_dup_of is null then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from transactions t
        left join transaction_import_links il on il.transaction_id = t.id
       where t.type = v_row.type
         and il.transaction_id is null
         and not exists (
           select 1 from plan_transaction_links l
           where l.transaction_id = t.id
         )
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 1) and (v_row.posted_at + 1)
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
       order by t.date
       limit 1;
    end if;

    if v_dup_of is not null then
      if v_row.decision = 'import' then
        update transaction_import_rows
           set decision = 'duplicate', duplicate_of = v_dup_of
         where id = v_row.id;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'row_id',                      v_row.id,
        'duplicate_of_transaction_id', v_dup_of,
        'duplicate_of_date',           v_dup_date,
        'duplicate_of_amount',         v_dup_amt,
        'duplicate_of_currency',       v_dup_cur,
        'duplicate_of_description',    v_dup_desc
      );
    end if;
  end loop;

  return v_warnings;
end;
$$;

revoke all on function public.mark_preview_duplicates(uuid) from public;
grant execute on function public.mark_preview_duplicates(uuid) to authenticated;

create or replace function public.commit_import_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_session         public.transaction_import_sessions;
  v_account         public.bank_accounts;
  v_row             public.transaction_import_rows;
  v_pending         int;
  v_uncat           int;
  v_inne_expense    uuid;
  v_inne_income     uuid;
  v_cat_id          uuid;
  v_inserted        int := 0;
  v_dup_preview     int := 0;
  v_dup_commit      int := 0;
  v_skipped         int := 0;
  v_new_tx_id       uuid;
  v_fingerprint     text;
  v_dup_of          uuid;
  v_dup_date        date;
  v_dup_amount      numeric(12, 2);
  v_dup_currency    text;
  v_dup_description text;
  v_winner          uuid;
  v_warnings        jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from public.transaction_import_sessions
   where id = p_session_id
     and user_id = v_uid
   for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'preview' then
    raise exception 'session_not_committable'
      using errcode = 'P0001', detail = format('status=%s', v_session.status);
  end if;

  select count(*) into v_pending
    from public.transaction_import_rows
   where session_id = p_session_id
     and decision = 'pending';

  if v_pending > 0 then
    raise exception 'rows_pending'
      using errcode = 'P0001', detail = format('count=%s', v_pending);
  end if;

  select * into v_account
    from public.bank_accounts
   where id = v_session.bank_account_id
     and user_id = v_uid
     and archived_at is null;

  if not found then
    raise exception 'account_invalid' using errcode = 'P0001';
  end if;

  if v_account.kind <> coalesce(v_session.adapter_kind, v_session.detected_kind) then
    raise exception 'account_kind_mismatch'
      using errcode = 'P0001',
            detail = format('account=%s session=%s',
              v_account.kind, coalesce(v_session.adapter_kind, v_session.detected_kind));
  end if;

  select count(*) into v_uncat
    from public.transaction_import_rows
   where session_id = p_session_id
     and decision = 'import'
     and selected_category_id is null;

  if v_uncat > 0 then
    select id into v_inne_expense
      from public.categories
     where user_id = v_uid and type = 'expense' and name = 'Inne wydatki'
     limit 1;
    select id into v_inne_income
      from public.categories
     where user_id = v_uid and type = 'income' and name = 'Inne przychody'
     limit 1;

    if v_inne_expense is null or v_inne_income is null then
      perform public.seed_default_categories(v_uid);
      select id into v_inne_expense
        from public.categories
       where user_id = v_uid and type = 'expense' and name = 'Inne wydatki'
       limit 1;
      select id into v_inne_income
        from public.categories
       where user_id = v_uid and type = 'income' and name = 'Inne przychody'
       limit 1;
    end if;

    if v_inne_expense is null or v_inne_income is null then
      raise exception 'fallback_category_unavailable' using errcode = 'P0001';
    end if;
  end if;

  for v_row in
    select *
      from public.transaction_import_rows
     where session_id = p_session_id
       and decision = 'import'
     order by row_index
  loop
    if v_row.selected_category_id is not null then
      if not exists (
        select 1
          from public.categories c
         where c.id = v_row.selected_category_id
           and c.user_id = v_uid
           and c.type = v_row.type
      ) then
        raise exception 'category_invalid'
          using errcode = 'P0001', detail = format('row_index=%s', v_row.row_index);
      end if;
    end if;

    if v_row.selected_group_id is not null then
      if not exists (
        select 1
          from public.group_members
         where group_id = v_row.selected_group_id
           and user_id = v_uid
      ) then
        raise exception 'group_forbidden'
          using errcode = 'P0001', detail = format('row_index=%s', v_row.row_index);
      end if;
    end if;
  end loop;

  for v_row in
    select *
      from public.transaction_import_rows
     where session_id = p_session_id
     order by row_index
  loop
    if v_row.decision = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_row.decision = 'duplicate' then
      v_dup_preview := v_dup_preview + 1;
      continue;
    end if;

    if v_row.selected_category_id is not null then
      v_cat_id := v_row.selected_category_id;
    elsif v_row.type = 'expense' then
      v_cat_id := v_inne_expense;
    else
      v_cat_id := v_inne_income;
    end if;

    v_fingerprint := encode(
      extensions.digest(
        v_row.amount::text
        || '|' || v_row.currency
        || '|' || coalesce(v_row.description, '')
        || '|' || coalesce(v_row.counterparty, ''),
        'sha256'
      ),
      'hex'
    );

    begin
      insert into public.transactions (
        user_id, category_id, group_id,
        description, amount, currency, type, date, status
      ) values (
        v_uid,
        v_cat_id,
        v_row.selected_group_id,
        coalesce(nullif(btrim(v_row.edited_description), ''), v_row.description),
        v_row.amount,
        v_row.currency,
        v_row.type,
        v_row.posted_at::timestamptz,
        'paid'
      )
      returning id into v_new_tx_id;

      insert into public.transaction_import_links (
        transaction_id, user_id, bank_account_id,
        session_id, row_id, external_transaction_id,
        source_file_hash, source_row_index, fingerprint
      ) values (
        v_new_tx_id, v_uid, v_session.bank_account_id,
        p_session_id, v_row.id, v_row.external_id,
        v_session.source_file_hash, v_row.row_index, v_fingerprint
      );

      update public.transaction_import_rows
         set transaction_id = v_new_tx_id
       where id = v_row.id;

      v_inserted := v_inserted + 1;

      v_dup_of := null;
      v_dup_date := null;
      v_dup_amount := null;
      v_dup_currency := null;
      v_dup_description := null;

      select
        duplicate_of_transaction_id,
        duplicate_of_date,
        duplicate_of_amount,
        duplicate_of_currency,
        duplicate_of_description
      into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
      from public.find_import_duplicate_warning(v_uid, v_row, v_fingerprint, v_new_tx_id)
      limit 1;

      if v_dup_of is not null then
        v_warnings := v_warnings || jsonb_build_object(
          'row_id',                       v_row.id,
          'duplicate_of_transaction_id',  v_dup_of,
          'duplicate_of_date',            v_dup_date,
          'duplicate_of_amount',          v_dup_amount,
          'duplicate_of_currency',        v_dup_currency,
          'duplicate_of_description',     v_dup_description
        );
      end if;

    exception when unique_violation then
      v_dup_commit := v_dup_commit + 1;

      v_winner := null;
      if v_row.external_id is not null then
        select l.transaction_id into v_winner
          from public.transaction_import_links l
         where l.user_id = v_uid
           and l.bank_account_id = v_session.bank_account_id
           and l.external_transaction_id = v_row.external_id
         limit 1;
      end if;

      if v_winner is null then
        select l.transaction_id into v_winner
          from public.transaction_import_links l
         where l.user_id = v_uid
           and l.bank_account_id = v_session.bank_account_id
           and l.source_file_hash = v_session.source_file_hash
           and l.source_row_index = v_row.row_index
         limit 1;
      end if;

      update public.transaction_import_rows
         set decision     = 'duplicate',
             duplicate_of = v_winner
       where id = v_row.id;
    end;
  end loop;

  update public.transaction_import_sessions
     set status         = 'committed',
         rows_committed = v_inserted,
         rows_skipped   = v_skipped,
         rows_duplicate = v_dup_preview + v_dup_commit,
         committed_at   = now()
   where id = p_session_id;

  return jsonb_build_object(
    'inserted',             v_inserted,
    'duplicates_preview',   v_dup_preview,
    'duplicates_commit',    v_dup_commit,
    'skipped',              v_skipped,
    'fingerprint_warnings', v_warnings
  );
end;
$$;

revoke all on function public.commit_import_session(uuid) from public;
grant execute on function public.commit_import_session(uuid) to authenticated;

comment on function public.commit_import_session(uuid) is
  'Bank import commit: SECURITY DEFINER, preview-only, single-transaction. '
  'Category must be owned by caller; uncategorized import rows fall back to the '
  'caller''s own "Inne wydatki"/"Inne przychody" defaults. Duplicate warnings '
  'use plan-linked expenses after first-class Plans replaced shopping_lists.';
