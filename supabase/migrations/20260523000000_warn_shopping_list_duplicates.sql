-- Forward-only: extend bank-import probable-duplicate warnings to cover
-- shopping-list-created expense transactions.
--
-- Existing Path A (fingerprint match through transaction_import_links) is
-- preserved verbatim. Added Path B fires when a bank row plausibly
-- matches an expense transaction created by completing a shopping list:
--   - r.type = 'expense'
--   - t.type = 'expense'
--   - t.shopping_list_id IS NOT NULL
--   - exact amount match
--   - exact currency match
--   - t.date within posted_at ± 3 days
--   - transaction visible to caller (mirrors transactions SELECT RLS:
--     t.user_id = auth.uid() OR is_group_member(t.group_id))
--
-- The visibility predicate is INLINED. Do NOT rely on the existing
-- preview_fingerprint_warnings predicate - that one is owner-scoped
-- through transaction_import_links.user_id = auth.uid() and does not
-- generalize to a direct transactions scan under SECURITY DEFINER.

create or replace function preview_fingerprint_warnings(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_session   transaction_import_sessions;
  v_warnings  jsonb := '[]'::jsonb;
  v_row       transaction_import_rows;
  v_fp        text;
  v_dup_of    uuid;
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

    -- Path A: owner-scoped fingerprint scan through prior import links.
    v_dup_of := null;
    select l.transaction_id into v_dup_of
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
     order by t.date
     limit 1;

    -- Path B: shopping-list-created expense candidate (visible to caller).
    if v_dup_of is null and v_row.type = 'expense' then
      select t.id into v_dup_of
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

    if v_dup_of is not null then
      v_warnings := v_warnings || jsonb_build_object(
        'row_id',                      v_row.id,
        'duplicate_of_transaction_id', v_dup_of
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
  'Read-only; matches commit_import_session warning semantics.';


-- commit_import_session: verbatim copy of 20260521000000 with one inserted
-- Path B block (shopping-list-created expense candidate) right after the
-- existing Path A fingerprint lookup inside the insert loop.

create or replace function commit_import_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_session      transaction_import_sessions;
  v_account      bank_accounts;
  v_row          transaction_import_rows;
  v_pending      int;
  v_inserted     int := 0;
  v_dup_preview  int := 0;
  v_dup_commit   int := 0;
  v_skipped      int := 0;
  v_new_tx_id    uuid;
  v_fingerprint  text;
  v_dup_of       uuid;
  v_winner       uuid;
  v_warnings     jsonb := '[]'::jsonb;
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

      -- Soft-dup warning: same caller, same fingerprint, tx within ±3 days.
      -- Excludes the link we just created.
      v_dup_of := null;
      select l.transaction_id into v_dup_of
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
        select t.id into v_dup_of
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

      if v_dup_of is not null then
        v_warnings := v_warnings || jsonb_build_object(
          'row_id', v_row.id,
          'duplicate_of_transaction_id', v_dup_of
        );
      end if;

    exception when unique_violation then
      -- Savepoint rolls back both the transactions insert and the links insert.
      v_dup_commit := v_dup_commit + 1;

      -- Reflect the dup on the audit row so the session record stays truthful.
      -- Lookup order matches the two unique indexes in priority:
      --   1. external_transaction_id (bank op id) - preferred when available
      --   2. (source_file_hash, source_row_index) - same-file row idempotency
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
  'Soft-dup warnings now include Path B: shopping-list-created expense candidates '
  '(visible to caller, exact amount/currency, ±3 days).';
