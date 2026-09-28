-- A payment marked paid is one ledger fact. A later bank row may fold into it
-- only when the payee is similar, the amount matches, and the posting date is
-- within three days. A different payee is never an automatic duplicate. A
-- similar payee with a different amount stays pending. One fact can absorb
-- only one import row, so a second real charge is not swallowed.

create or replace function public.import_payee_similar(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  left_tokens text[];
  right_tokens text[];
  token text;
begin
  left_tokens := regexp_split_to_array(lower(coalesce(a, '')), '[^[:alnum:]]+');
  right_tokens := regexp_split_to_array(lower(coalesce(b, '')), '[^[:alnum:]]+');
  if left_tokens is null then
    return false;
  end if;
  foreach token in array left_tokens loop
    if length(token) >= 4 and token = any(right_tokens) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.import_payee_similar(text, text) from public, anon, authenticated;

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
       and t.date::date between (p_row.posted_at - 3) and (p_row.posted_at + 3)
       and public.import_payee_similar(
         concat_ws(' ', p_row.description, p_row.counterparty),
         concat_ws(' ', t.description, t.counterparty)
       )
       and (
            t.user_id = p_uid
         or (t.group_id is not null and public.is_group_member(t.group_id))
       )
     order by abs(t.date::date - p_row.posted_at), t.date
     limit 1;
end;
$$;

revoke all on function public.find_import_duplicate_warning(uuid, public.transaction_import_rows, text, uuid)
  from public, anon, authenticated;

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
  v_claimed  uuid[] := array[]::uuid[];
  v_payee    text;
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
    v_payee := concat_ws(' ', v_row.description, v_row.counterparty);

    v_dup_of := null;
    v_dup_date := null; v_dup_amt := null; v_dup_cur := null; v_dup_desc := null;

    select t.id, t.date::date, t.amount, t.currency, t.description
      into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and coalesce(l.is_hold, false) = false
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
       and not (t.id = any(v_claimed))
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
         and not (t.id = any(v_claimed))
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
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and not (t.id = any(v_claimed))
         and public.import_payee_similar(v_payee, concat_ws(' ', t.description, t.counterparty))
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
       order by abs(t.date::date - v_row.posted_at), t.date
       limit 1;
    end if;

    if v_dup_of is not null then
      v_claimed := array_append(v_claimed, v_dup_of);
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
    elsif v_row.decision = 'import' and exists (
      select 1
        from transactions t
        left join transaction_import_links il on il.transaction_id = t.id
       where t.type = v_row.type
         and il.transaction_id is null
         and not exists (
           select 1 from plan_transaction_links l
           where l.transaction_id = t.id
         )
         and t.amount <> v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and not (t.id = any(v_claimed))
         and public.import_payee_similar(v_payee, concat_ws(' ', t.description, t.counterparty))
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
    ) then
      update transaction_import_rows
         set decision = 'pending'
       where id = v_row.id;
    end if;
  end loop;

  return v_warnings;
end;
$$;

revoke all on function public.mark_preview_duplicates(uuid) from public;
grant execute on function public.mark_preview_duplicates(uuid) to authenticated;
