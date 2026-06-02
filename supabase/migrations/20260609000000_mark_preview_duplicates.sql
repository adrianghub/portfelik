-- Bank import v2 (issue #73): default-import + folded duplicates.
--
-- mark_preview_duplicates runs the same probable-duplicate scan as
-- preview_fingerprint_warnings, but ALSO sets decision='duplicate' (and
-- duplicate_of) on matched rows that are still decision='import'. Called once
-- right after insertPreviewRows so the review surface opens with duplicates
-- pre-skipped. Read-only preview_fingerprint_warnings stays for resume/refresh
-- banner detail (never re-mutates, so a user's "import anyway" is preserved).
--
-- Scan paths + fingerprint formula MUST match commit_import_session and
-- preview_fingerprint_warnings exactly. Only rows with decision='import' are
-- flipped: skip / already-duplicate rows are untouched (idempotent).

create or replace function mark_preview_duplicates(p_session_id uuid)
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
  v_dup_of    uuid;
  v_dup_date  date;
  v_dup_amt   numeric(12,2);
  v_dup_cur   text;
  v_dup_desc  text;
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
    v_dup_date := null; v_dup_amt := null; v_dup_cur := null; v_dup_desc := null;

    -- Path A: prior imported-link fingerprint match (±3 days)
    select t.id, t.date::date, t.amount, t.currency, t.description
      into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
     order by t.date
     limit 1;

    -- Path B: shopping-list-created expense match (±3 days)
    if v_dup_of is null and v_row.type = 'expense' then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from transactions t
       where t.type = 'expense'
         and t.shopping_list_id is not null
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
       order by t.date
       limit 1;
    end if;

    -- Path C: manual / non-list transaction match (±1 day)
    if v_dup_of is null then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from transactions t
        left join transaction_import_links l on l.transaction_id = t.id
       where t.type = v_row.type
         and t.shopping_list_id is null
         and l.transaction_id is null
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

revoke all on function mark_preview_duplicates(uuid) from public;
grant execute on function mark_preview_duplicates(uuid) to authenticated;

comment on function mark_preview_duplicates(uuid) is
  'Bank import v2: flips probable-duplicate rows (decision=import) to duplicate '
  'and returns the same warning shape as preview_fingerprint_warnings. Run once '
  'after insertPreviewRows. Idempotent: only import rows are flipped.';
