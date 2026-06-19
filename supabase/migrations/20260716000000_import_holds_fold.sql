-- Hold-aware fold (issue: import card holds).
--
-- A committed card hold (blokada) is marked is_hold + counterparty on its
-- transaction_import_link. A later settled row that reconciles that hold drifts
-- in amount (fuel pre-auths, e.g. a 200,00 hold settling at 199,93). On commit,
-- if a settled row matches a kept hold by counterparty + ±3 days + amount
-- tolerance, the held transaction's amount/date are updated in place, the hold
-- flag is cleared, and the settled row is marked decision='duplicate' -- so the
-- pre-auth reconciles instead of double-counting.
--
-- The fold MUTATION happens ONLY in commit_import_session. The preview matchers
-- merely step aside for hold-linked matches: the shared duplicate scanner
-- (find_import_duplicate_warning, used by preview_fingerprint_warnings and
-- commit) and the standalone mark_preview_duplicates exclude still-held links
-- from their fingerprint Path A, so the settled row survives to commit as
-- decision='import' for the fold to act on.
--
-- Starting points (latest definitions): find_import_duplicate_warning and
-- mark_preview_duplicates from 20260617000000_first_class_plans.sql;
-- commit_import_session from 20260627000000_commit_import_counterparty.sql.
-- preview_fingerprint_warnings is unchanged here because it delegates Path A
-- to find_import_duplicate_warning.

-- 1. Link columns: hold flag + counterparty (for the tolerant fold lookup).
alter table public.transaction_import_links
  add column if not exists is_hold boolean not null default false;
alter table public.transaction_import_links
  add column if not exists counterparty text;

-- 2. Shared duplicate scanner: exclude still-held links from Path A. Body is
--    otherwise verbatim from 20260617000000_first_class_plans.sql. This covers
--    both preview_fingerprint_warnings and commit_import_session's own warning
--    detection, keeping their matching predicate byte-identical (existing
--    invariant).
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
  -- Exclude still-held links so a settled row can fold at commit instead of
  -- being pre-marked a plain duplicate.
  return query
    select t.id, t.date::date, t.amount, t.currency::text, t.description
      from public.transaction_import_links l
      join public.transactions t on t.id = l.transaction_id
     where l.user_id = p_uid
       and l.fingerprint = p_fingerprint
       and coalesce(l.is_hold, false) = false
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

-- 3. mark_preview_duplicates: exclude still-held links from its inline Path A.
--    Body is otherwise verbatim from 20260617000000_first_class_plans.sql.
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

    -- Path A: prior imported-link fingerprint match (±3 days).
    -- Exclude still-held links so a settled row can fold at commit.
    select t.id, t.date::date, t.amount, t.currency, t.description
      into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and coalesce(l.is_hold, false) = false
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

-- 4. commit_import_session: mark committed holds (is_hold + counterparty on the
--    link) and perform the tolerant hold-fold for settled rows. Body is
--    otherwise verbatim from 20260617000000_first_class_plans.sql.
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
  v_hold_match      record;
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

    -- Hold-aware tolerant fold: this settled row reconciles a previously kept
    -- card hold. Gated on l.is_hold so a normal same-merchant purchase of a
    -- different amount is never folded. Counterparty equality + ±3 days +
    -- amount tolerance (settle <= hold OR |Δ| <= greatest(50, 10% of hold)).
    -- transaction_import_links is keyed by transaction_id (no surrogate id).
    if v_row.counterparty is not null then
      v_hold_match := null;
      select l.transaction_id as transaction_id, t.amount as hold_amount
        into v_hold_match
        from public.transaction_import_links l
        join public.transactions t on t.id = l.transaction_id
       where l.user_id = v_uid
         and l.is_hold = true
         and l.counterparty is not null
         and l.counterparty = v_row.counterparty
         and t.type = v_row.type
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and (
           v_row.amount <= t.amount
           or abs(v_row.amount - t.amount) <= greatest(50.00, 0.10 * t.amount)
         )
       order by abs(v_row.amount - t.amount) asc
       limit 1;

      if v_hold_match.transaction_id is not null then
        -- Settle the held transaction in place; do NOT insert a new row/link.
        update public.transactions
           set amount = v_row.amount,
               date = v_row.posted_at::timestamptz
         where id = v_hold_match.transaction_id;
        update public.transaction_import_links
           set is_hold = false
         where transaction_id = v_hold_match.transaction_id;
        update public.transaction_import_rows
           set decision = 'duplicate', duplicate_of = v_hold_match.transaction_id
         where id = v_row.id;
        v_dup_commit := v_dup_commit + 1;  -- reuse the existing commit-dup counter
        continue;  -- skip the normal insert for this row
      end if;
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
        source_file_hash, source_row_index, fingerprint,
        is_hold, counterparty
      ) values (
        v_new_tx_id, v_uid, v_session.bank_account_id,
        p_session_id, v_row.id, v_row.external_id,
        v_session.source_file_hash, v_row.row_index, v_fingerprint,
        coalesce(v_row.is_hold, false), v_row.counterparty
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
  'plan-linked expenses after first-class Plans replaced shopping_lists. '
  'Marks committed holds (is_hold + counterparty) on their link and tolerantly '
  'folds a later settled row into a kept hold (counterparty + ±3 days + amount '
  'tolerance) instead of double-counting.';
