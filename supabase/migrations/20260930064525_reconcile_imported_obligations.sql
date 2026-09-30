-- A preview duplicate that points at an unimported expense is not merely a row
-- to skip. It is the bank confirmation of an existing manual ledger fact (or
-- an upcoming/overdue obligation). Reconcile it in the same transaction as the
-- import commit and attach durable, owner-private import provenance.
--
-- Keep the previously deployed commit implementation intact behind a private
-- implementation name. The public wrapper preserves its validation, hold-fold,
-- hard-dedupe, counters and locking, then reconciles eligible preview
-- duplicates before the RPC transaction can commit.

alter function public.commit_import_session(uuid)
  rename to commit_import_session_before_obligation_reconcile;

revoke all on function public.commit_import_session_before_obligation_reconcile(uuid)
  from public, anon, authenticated, service_role;

-- The matcher is invoked by the SECURITY DEFINER wrapper. Pin its lookup path
-- even though it currently uses built-ins only, so later edits cannot resolve
-- attacker-controlled objects from an exposed schema.
alter function public.import_payee_similar(text, text) set search_path = '';
revoke all on function public.import_payee_similar(text, text)
  from public, anon, authenticated, service_role;

-- Automatic settlement needs a merchant identity, not any shared word.
-- "Orange Polska" and "Energa Polska" must not match through "Polska".
-- Compare the leading distinctive merchant token after bank boilerplate,
-- country names and corporate suffixes have been removed. Conservative
-- misses preserve the incoming bank fact as a separate import.
create function public.import_obligation_payee_matches(a text, b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with sides as (
    select side, token, ord
      from (values (1, a), (2, b)) input(side, label)
      cross join lateral regexp_split_to_table(
        translate(lower(coalesce(label, '')), 'ąćęłńóśźżäöü', 'acelnoszzaou'),
        '[^[:alnum:]]+'
      ) with ordinality words(token, ord)
     where length(token) >= 4
       and token !~ '^[0-9]+$'
       and token <> all(array[
         'platnosc', 'platnosci', 'karta', 'karty', 'blik',
         'przelew', 'przelewy', 'przelewem', 'transakcja', 'transakcje',
         'zakup', 'zakupy', 'elixir', 'operacja', 'operacji',
         'wplata', 'wyplata', 'obciazenie', 'uznanie', 'tytul', 'tytulem',
         'konto', 'rachunek', 'rachunku', 'platnicza', 'platnicze',
         'visa', 'mastercard', 'master', 'card', 'payment', 'debit', 'credit',
         'terminal', 'oplata', 'oplaty', 'polska', 'poland',
         'spolka', 'akcyjna', 'limited', 'uslugi'
       ])
  ), identities as (
    select distinct on (side) side, token
      from sides
     order by side, ord
  )
  select coalesce(
    (select token from identities where side = 1)
    = (select token from identities where side = 2),
    false
  );
$$;

revoke all on function public.import_obligation_payee_matches(text, text)
  from public, anon, authenticated, service_role;

create function public.commit_import_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid                  uuid := (select auth.uid());
  v_result               jsonb;
  v_session              public.transaction_import_sessions;
  v_row                  public.transaction_import_rows;
  v_target_link          public.transaction_import_links;
  v_target_id            uuid;
  v_target_description   text;
  v_target_counterparty  text;
  v_fingerprint          text;
  v_existing_transaction uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select *
    into v_session
    from public.transaction_import_sessions s
   where s.id = p_session_id
     and s.user_id = v_uid
   for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'preview' then
    raise exception 'session_not_committable'
      using errcode = 'P0001', detail = format('status=%s', v_session.status);
  end if;

  for v_row in
    select r.*
      from public.transaction_import_rows r
     where r.session_id = p_session_id
       and r.decision = 'duplicate'
       and r.duplicate_of is not null
       and r.transaction_id is null
     order by r.row_index
  loop
    -- A nested block gives each reconciliation its own savepoint. A hard
    -- provenance collision therefore leaves the existing winner untouched and
    -- cannot leave the target half-updated.
    begin
      v_target_id := null;
      v_target_description := null;
      v_target_counterparty := null;
      v_target_link := null;

      select t.id, t.description, t.counterparty
        into v_target_id, v_target_description, v_target_counterparty
        from public.transactions t
       where t.id = v_row.duplicate_of
         and v_row.type = 'expense'
         and t.type = 'expense'
         and t.status in ('upcoming', 'overdue', 'paid')
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and (
           (
             t.user_id = v_uid
             and (
               t.group_id is null
               or public.is_group_member(t.group_id)
             )
           )
           or (
             t.user_id <> v_uid
             and t.group_id is not null
             and public.is_group_co_owner(t.group_id)
           )
         )
         and public.import_obligation_payee_matches(
           concat_ws(' ', v_row.description, v_row.counterparty),
           concat_ws(' ', t.description, t.counterparty)
         )
         and not exists (
           select 1
             from public.plan_transaction_links plan_link
             join public.plans p on p.id = plan_link.plan_id
            where plan_link.transaction_id = t.id
              and (
                v_row.posted_at < p.start_date
                or v_row.posted_at > p.end_date
              )
         )
       for update of t;

      if v_target_id is null then
        update public.transaction_import_rows r
           set decision = 'import', duplicate_of = null
         where r.id = v_row.id;
        continue;
      end if;

      select l.*
        into v_target_link
        from public.transaction_import_links l
       where l.transaction_id = v_target_id;

      if v_target_link.transaction_id is not null then
        -- The preview can be stale. A different stable bank identifier means
        -- this is another charge, so preserve it as a normal imported row.
        if v_target_link.external_transaction_id is not null
           and v_row.external_id is not null
           and (
             v_target_link.bank_account_id <> v_session.bank_account_id
             or v_target_link.external_transaction_id <> v_row.external_id
           ) then
          update public.transaction_import_rows r
             set decision = 'import', duplicate_of = null
           where r.id = v_row.id;
        else
          update public.transaction_import_rows r
             set duplicate_of = v_target_id
           where r.id = v_row.id;
        end if;
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

      -- Keep the user's meaningful obligation label unless they explicitly
      -- edited the import description. The bank posting date and counterparty
      -- become ledger truth; category, group and recurrence provenance remain
      -- attached to the original obligation.
      update public.transactions t
         set status = 'paid',
             date = v_row.posted_at::timestamptz,
             description = coalesce(
               nullif(btrim(v_row.edited_description), ''),
               v_target_description
             ),
             counterparty = coalesce(
               nullif(btrim(v_row.counterparty), ''),
               v_target_counterparty
             )
       where t.id = v_target_id;

      insert into public.transaction_import_links (
        transaction_id,
        user_id,
        bank_account_id,
        session_id,
        row_id,
        external_transaction_id,
        source_file_hash,
        source_row_index,
        fingerprint,
        is_hold,
        counterparty
      ) values (
        v_target_id,
        v_uid,
        v_session.bank_account_id,
        p_session_id,
        v_row.id,
        v_row.external_id,
        v_session.source_file_hash,
        v_row.row_index,
        v_fingerprint,
        false,
        v_row.counterparty
      );

      update public.transaction_import_rows r
         set transaction_id = v_target_id
       where r.id = v_row.id;

    exception
      when unique_violation then
        -- Another row/session already owns this exact bank provenance. Preserve
        -- that durable winner; the subtransaction has rolled back any target
        -- update performed above.
        v_existing_transaction := null;

        if v_row.external_id is not null then
          select l.transaction_id
            into v_existing_transaction
            from public.transaction_import_links l
           where l.user_id = v_uid
             and l.bank_account_id = v_session.bank_account_id
             and l.external_transaction_id = v_row.external_id
           limit 1;
        end if;

        if v_existing_transaction is null then
          select l.transaction_id
            into v_existing_transaction
            from public.transaction_import_links l
           where l.user_id = v_uid
             and l.bank_account_id = v_session.bank_account_id
             and l.source_file_hash = v_session.source_file_hash
             and l.source_row_index = v_row.row_index
           limit 1;
        end if;

        if v_existing_transaction is not null then
          update public.transaction_import_rows r
             set duplicate_of = v_existing_transaction
           where r.id = v_row.id;
        else
          update public.transaction_import_rows r
             set decision = 'import', duplicate_of = null
           where r.id = v_row.id;
        end if;
    end;
  end loop;

  -- The original implementation now sees reconciled rows as preview
  -- duplicates and any rejected/stale matches as normal import rows. It keeps
  -- its category validation, hold folding, hard dedupe, counters and final
  -- session transition inside this same database transaction.
  v_result := public.commit_import_session_before_obligation_reconcile(p_session_id);

  return v_result;
end;
$$;

revoke all on function public.commit_import_session(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.commit_import_session(uuid) to authenticated, service_role;

comment on function public.commit_import_session(uuid) is
  'Atomic bank-import commit. Preserves the existing commit contract and reconciles '
  'eligible duplicate expense rows into unimported upcoming, overdue or manually paid '
  'transactions, then records owner-private transaction_import_links provenance so a '
  'later import cannot match the same manual transaction again.';

-- Distinct bank-side identifiers are distinct facts even when two payments
-- share payee, amount and nearby dates. Fingerprint fallback remains available
-- when either side has no stable external identifier.
create or replace function public.mark_preview_duplicates(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_session  public.transaction_import_sessions;
  v_warnings jsonb := '[]'::jsonb;
  v_row      public.transaction_import_rows;
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
    from public.transaction_import_sessions
   where id = p_session_id
     and user_id = v_uid
   for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'preview' then
    raise exception 'session_not_in_preview_state'
      using errcode = 'P0001', detail = format('status=%s', v_session.status);
  end if;

  for v_row in
    select * from public.transaction_import_rows
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
      from public.transaction_import_links l
      join public.transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and coalesce(l.is_hold, false) = false
       and (
         v_row.external_id is null
         or l.external_transaction_id is null
         or (
           l.bank_account_id = v_session.bank_account_id
           and l.external_transaction_id = v_row.external_id
         )
       )
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
       and not (t.id = any(v_claimed))
     order by t.date
     limit 1;

    if v_dup_of is null and v_row.type = 'expense' then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from public.transactions t
       where t.type = 'expense'
         and exists (
           select 1
             from public.plan_transaction_links l
             join public.plans p on p.id = l.plan_id
            where l.transaction_id = t.id
              and v_row.posted_at between p.start_date and p.end_date
         )
         and not exists (
           select 1 from public.transaction_import_links il
            where il.transaction_id = t.id
         )
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and not (t.id = any(v_claimed))
         and public.import_obligation_payee_matches(
           v_payee,
           concat_ws(' ', t.description, t.counterparty)
         )
         and (
           (t.user_id = v_uid and (t.group_id is null or public.is_group_member(t.group_id)))
           or (
             t.user_id <> v_uid
             and t.group_id is not null
             and public.is_group_co_owner(t.group_id)
           )
         )
       order by abs(t.date::date - v_row.posted_at), t.date
       limit 1;
    end if;

    if v_dup_of is null then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from public.transactions t
        left join public.transaction_import_links il on il.transaction_id = t.id
       where t.type = v_row.type
         and il.transaction_id is null
         and not exists (
           select 1 from public.plan_transaction_links l
           where l.transaction_id = t.id
         )
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and not (t.id = any(v_claimed))
         and public.import_obligation_payee_matches(v_payee, concat_ws(' ', t.description, t.counterparty))
         and (
           (t.user_id = v_uid and (t.group_id is null or public.is_group_member(t.group_id)))
           or (
             t.user_id <> v_uid
             and t.group_id is not null
             and public.is_group_co_owner(t.group_id)
           )
         )
       order by abs(t.date::date - v_row.posted_at), t.date
       limit 1;
    end if;

    if v_dup_of is not null then
      v_claimed := array_append(v_claimed, v_dup_of);
      if v_row.decision = 'import' then
        update public.transaction_import_rows
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
        from public.transactions t
        left join public.transaction_import_links il on il.transaction_id = t.id
       where t.type = v_row.type
         and il.transaction_id is null
         and not exists (
           select 1 from public.plan_transaction_links l
           where l.transaction_id = t.id
         )
         and t.amount <> v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and not (t.id = any(v_claimed))
         and public.import_obligation_payee_matches(v_payee, concat_ws(' ', t.description, t.counterparty))
         and (
           (t.user_id = v_uid and (t.group_id is null or public.is_group_member(t.group_id)))
           or (
             t.user_id <> v_uid
             and t.group_id is not null
             and public.is_group_co_owner(t.group_id)
           )
         )
    ) then
      update public.transaction_import_rows
         set decision = 'pending'
       where id = v_row.id;
    end if;
  end loop;

  return v_warnings;
end;
$$;

revoke all on function public.mark_preview_duplicates(uuid) from public, anon;
grant execute on function public.mark_preview_duplicates(uuid) to authenticated;
