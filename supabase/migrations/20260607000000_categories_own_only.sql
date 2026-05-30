-- Transaction categories are strictly per-user. Group-shared read caused duplicate
-- names in UI when co-members each owned an identical default set. Dedupe any
-- existing owned duplicates, drop group-shared SELECT, add uniqueness guard,
-- and tighten bank-import category validation to own rows only.

-- ── 1. Dedupe owned rows (keep oldest per user + name + type) ────────────────
do $$
declare
  r record;
  v_keeper uuid;
  v_dupe uuid;
begin
  for r in
    select user_id, lower(name) as name_l, type
      from categories
     where user_id is not null
     group by user_id, lower(name), type
    having count(*) > 1
  loop
    select id into v_keeper
      from categories
     where user_id = r.user_id
       and lower(name) = r.name_l
       and type = r.type
     order by created_at asc, id asc
     limit 1;

    for v_dupe in
      select id
        from categories
       where user_id = r.user_id
         and lower(name) = r.name_l
         and type = r.type
         and id <> v_keeper
    loop
      update transactions
         set category_id = v_keeper
       where category_id = v_dupe;

      update shopping_lists
         set category_id = v_keeper
       where category_id = v_dupe;

      update categorization_rules
         set category_id = v_keeper
       where category_id = v_dupe;

      update transaction_import_rows
         set suggested_category_id = v_keeper
       where suggested_category_id = v_dupe;

      update transaction_import_rows
         set selected_category_id = v_keeper
       where selected_category_id = v_dupe;

      delete from categories where id = v_dupe;
    end loop;
  end loop;
end $$;

-- ── 2. Prevent future duplicates ─────────────────────────────────────────────
create unique index if not exists categories_user_name_type_unique
  on categories (user_id, lower(name), type)
  where user_id is not null;

-- ── 3. Drop group-shared category read ───────────────────────────────────────
drop policy if exists "categories: users read group-shared" on categories;

comment on table categories is
  'Transaction categories. Always user-owned; defaults seeded per user on signup. Not group-shared.';

-- ── 4. Bank import: category must belong to caller ───────────────────────────
create or replace function commit_import_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_session         transaction_import_sessions;
  v_account         bank_accounts;
  v_row             transaction_import_rows;
  v_pending         int;
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
    from transaction_import_sessions
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
    from transaction_import_rows
   where session_id = p_session_id
     and decision = 'pending';

  if v_pending > 0 then
    raise exception 'rows_pending'
      using errcode = 'P0001', detail = format('count=%s', v_pending);
  end if;

  select * into v_account
    from bank_accounts
   where id = v_session.bank_account_id
     and user_id = v_uid
     and archived_at is null;

  if not found then
    raise exception 'account_invalid' using errcode = 'P0001';
  end if;

  if v_account.kind <> v_session.detected_kind then
    raise exception 'account_kind_mismatch'
      using errcode = 'P0001',
            detail = format('account=%s session=%s', v_account.kind, v_session.detected_kind);
  end if;

  for v_row in
    select *
      from transaction_import_rows
     where session_id = p_session_id
       and decision = 'import'
     order by row_index
  loop
    if v_row.selected_category_id is null then
      raise exception 'category_required'
        using errcode = 'P0001', detail = format('row_index=%s', v_row.row_index);
    end if;

    if not exists (
      select 1
        from categories c
       where c.id = v_row.selected_category_id
         and c.user_id = v_uid
         and c.type = v_row.type
    ) then
      raise exception 'category_invalid'
        using errcode = 'P0001', detail = format('row_index=%s', v_row.row_index);
    end if;

    if v_row.selected_group_id is not null then
      if not exists (
        select 1
          from group_members
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
      from transaction_import_rows
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
      insert into transactions (
        user_id, category_id, group_id,
        description, amount, currency, type, date, status
      ) values (
        v_uid,
        v_row.selected_category_id,
        v_row.selected_group_id,
        coalesce(nullif(btrim(v_row.edited_description), ''), v_row.description),
        v_row.amount,
        v_row.currency,
        v_row.type,
        v_row.posted_at::timestamptz,
        'paid'
      )
      returning id into v_new_tx_id;

      insert into transaction_import_links (
        transaction_id, user_id, bank_account_id,
        session_id, row_id, external_transaction_id,
        source_file_hash, source_row_index, fingerprint
      ) values (
        v_new_tx_id, v_uid, v_session.bank_account_id,
        p_session_id, v_row.id, v_row.external_id,
        v_session.source_file_hash, v_row.row_index, v_fingerprint
      );

      update transaction_import_rows
         set transaction_id = v_new_tx_id
       where id = v_row.id;

      v_inserted := v_inserted + 1;

      v_dup_of := null;
      v_dup_date := null;
      v_dup_amount := null;
      v_dup_currency := null;
      v_dup_description := null;

      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
        from transaction_import_links l
        join transactions t on t.id = l.transaction_id
       where l.user_id = v_uid
         and l.fingerprint = v_fingerprint
         and l.transaction_id <> v_new_tx_id
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
       order by t.date
       limit 1;

      if v_dup_of is null and v_row.type = 'expense' then
        select t.id, t.date::date, t.amount, t.currency, t.description
          into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
          from transactions t
         where t.type = 'expense'
           and t.shopping_list_id is not null
           and t.amount = v_row.amount
           and t.currency = v_row.currency
           and t.id <> v_new_tx_id
           and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
           and (
                t.user_id = v_uid
             or (t.group_id is not null and is_group_member(t.group_id))
           )
         order by t.date
         limit 1;
      end if;

      if v_dup_of is null then
        select t.id, t.date::date, t.amount, t.currency, t.description
          into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
          from transactions t
          left join transaction_import_links l on l.transaction_id = t.id
         where t.type = v_row.type
           and t.shopping_list_id is null
           and l.transaction_id is null
           and t.amount = v_row.amount
           and t.currency = v_row.currency
           and t.id <> v_new_tx_id
           and t.date::date between (v_row.posted_at - 1) and (v_row.posted_at + 1)
           and (
                t.user_id = v_uid
             or (t.group_id is not null and is_group_member(t.group_id))
           )
         order by t.date
         limit 1;
      end if;

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
          from transaction_import_links l
         where l.user_id = v_uid
           and l.bank_account_id = v_session.bank_account_id
           and l.external_transaction_id = v_row.external_id
         limit 1;
      end if;

      if v_winner is null then
        select l.transaction_id into v_winner
          from transaction_import_links l
         where l.user_id = v_uid
           and l.bank_account_id = v_session.bank_account_id
           and l.source_file_hash = v_session.source_file_hash
           and l.source_row_index = v_row.row_index
         limit 1;
      end if;

      update transaction_import_rows
         set decision     = 'duplicate',
             duplicate_of = v_winner
       where id = v_row.id;
    end;
  end loop;

  update transaction_import_sessions
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

revoke all on function commit_import_session(uuid) from public;
grant execute on function commit_import_session(uuid) to authenticated;

comment on function commit_import_session(uuid) is
  'Bank import commit: SECURITY DEFINER, preview-only, single-transaction. '
  'Category must be owned by caller (per-user categories).';
