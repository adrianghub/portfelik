-- Forward-only: include manual / non-list transactions in bank-import
-- probable-duplicate warnings.
--
-- Existing behavior:
--   Path A: prior bank-import link fingerprint match, ±3 days.
--   Path B: shopping-list-created expense match, exact amount/currency, ±3 days.
--
-- Added behavior:
--   Path C: visible, non-imported, non-list transaction match, exact
--           type/amount/currency, ±1 day.
--
-- Path C intentionally excludes transactions already represented in
-- transaction_import_links so imported transactions keep the stronger Path A
-- fingerprint behavior. The tighter ±1-day window limits false positives from
-- round manual amounts while still covering the common manual-then-import flow.
--
-- The warning JSON now includes enough matched-transaction context for the UI
-- to show what the badge refers to:
--   row_id, duplicate_of_transaction_id, duplicate_of_date,
--   duplicate_of_amount, duplicate_of_currency, duplicate_of_description.

create index if not exists idx_transactions_manual_duplicate_scan_user
  on public.transactions(user_id, type, amount, currency, date)
  where shopping_list_id is null;

create index if not exists idx_transactions_manual_duplicate_scan_group
  on public.transactions(group_id, type, amount, currency, date)
  where shopping_list_id is null and group_id is not null;

create or replace function preview_fingerprint_warnings(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_session         transaction_import_sessions;
  v_warnings        jsonb := '[]'::jsonb;
  v_row             transaction_import_rows;
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
    from transaction_import_sessions
   where id = p_session_id
     and user_id = v_uid;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  for v_row in
    select *
      from transaction_import_rows
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

    -- Path A: owner-scoped fingerprint scan through prior import links.
    select t.id, t.date::date, t.amount, t.currency, t.description
      into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
     order by t.date
     limit 1;

    -- Path B: shopping-list-created expense candidate (visible to caller).
    if v_dup_of is null and v_row.type = 'expense' then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amount, v_dup_currency, v_dup_description
        from transactions t
       where t.type = 'expense'
         and t.shopping_list_id is not null
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and (
              t.user_id = v_uid
           or (t.group_id is not null and is_group_member(t.group_id))
         )
       order by t.date
       limit 1;
    end if;

    -- Path C: manual / non-list candidate. Excludes already-imported
    -- transactions so prior bank imports keep the stricter Path A semantics.
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
  end loop;

  return v_warnings;
end;
$$;

revoke all on function preview_fingerprint_warnings(uuid) from public;
grant execute on function preview_fingerprint_warnings(uuid) to authenticated;

comment on function preview_fingerprint_warnings(uuid) is
  'Bank import probable-duplicate scan. Path A: prior imported-link fingerprint match. '
  'Path B: shopping-list-created expense match (visible to caller, exact amount/currency, ±3 days). '
  'Path C: visible non-imported non-list transaction match (exact type/amount/currency, ±1 day). '
  'Read-only; matches commit_import_session warning semantics.';

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

  -- Lock the session row for the duration of the transaction.
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

  -- Bank account validation. Re-checked at commit because the account
  -- could have been archived between preview and commit.
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

  -- Pre-validate every 'import' row BEFORE touching transactions.
  -- Keeps the insert loop's only failure mode to unique_violation.
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

    -- Category: visible to caller (system / own / group-shared) AND type matches.
    if not exists (
      select 1
        from categories c
       where c.id = v_row.selected_category_id
         and c.type = v_row.type
         and (
              c.user_id is null
           or c.user_id = v_uid
           or exists (
                select 1
                  from group_members gm1
                  join group_members gm2 on gm1.group_id = gm2.group_id
                 where gm1.user_id = v_uid
                   and gm2.user_id = c.user_id
              )
         )
    ) then
      raise exception 'category_invalid'
        using errcode = 'P0001', detail = format('row_index=%s', v_row.row_index);
    end if;

    -- Group: NULL ok, else caller must be a member.
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

  -- Insert loop. Per-row savepoint catches unique_violation only.
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

    -- decision = 'import' (others rejected by CHECK on the table).
    -- Fingerprint is intentionally date-INDEPENDENT: the ±3-day window in the
    -- soft-dup query below provides the date tolerance. Including the date here
    -- would make every off-by-one-day duplicate miss.
    -- digest() lives in extensions schema in Supabase; qualify so the tight
    -- search_path on this SECURITY DEFINER function still finds it.
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

      -- Path A: same caller, same fingerprint, tx within ±3 days.
      -- Excludes the link we just created.
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

      -- Path B: shopping-list-created expense candidate (visible to caller).
      -- Excludes the row we just inserted (t.id <> v_new_tx_id) so freshly
      -- linked tx does not warn against itself.
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

      -- Path C: manual / non-list candidate, with tighter ±1-day window.
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
      -- Savepoint rolls back both the transactions insert and the links insert.
      v_dup_commit := v_dup_commit + 1;

      -- Reflect the dup on the audit row so the session record stays truthful.
      -- Lookup order matches the two unique indexes in priority:
      --   1. external_transaction_id (bank op id) — preferred when available
      --   2. (source_file_hash, source_row_index) — same-file row idempotency
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
  'Pre-validates account/category/group/type; raises on any validation error '
  '(full rollback, session stays preview). Per-row savepoint catches '
  'unique_violation as duplicates_commit. Sole writer of transaction_import_links. '
  'Soft-dup warnings include Path A imported-link candidates, Path B shopping-list '
  'expense candidates (±3 days), and Path C non-imported non-list candidates (±1 day).';
