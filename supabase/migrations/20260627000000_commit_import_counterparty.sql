-- Copy import-row counterparty onto committed transactions (kontrahent).
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
        description, counterparty, amount, currency, type, date, status
      ) values (
        v_uid,
        v_cat_id,
        v_row.selected_group_id,
        coalesce(nullif(btrim(v_row.edited_description), ''), v_row.description),
        nullif(btrim(v_row.counterparty), ''),
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
  'caller''s own "Inne wydatki"/"Inne przychody" defaults. Copies import-row '
  'counterparty onto transactions.counterparty. Duplicate warnings use '
  'plan-linked expenses after first-class Plans replaced shopping_lists.';
