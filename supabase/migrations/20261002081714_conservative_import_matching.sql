-- Nearby payments with the same merchant and amount are not sufficient evidence
-- to choose one obligation. Keep these rows in review until the user chooses.
alter table public.transaction_import_rows
  add column obligation_match_confirmed boolean not null default false;
grant update (obligation_match_confirmed) on public.transaction_import_rows to authenticated;
-- Two distinct bank rows cannot settle the same obligation, including formats
-- without stable external IDs. The UI also disables already chosen targets.
create unique index import_rows_one_confirmed_obligation
  on public.transaction_import_rows (session_id, duplicate_of)
  where obligation_match_confirmed and decision = 'duplicate';

create function public.import_obligation_candidates(p_session_id uuid)
returns table (row_id uuid, candidates jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, jsonb_agg(jsonb_build_object(
    'id', t.id, 'date', t.date::date, 'amount', t.amount,
    'currency', t.currency, 'description', t.description
  ) order by abs(t.date::date - r.posted_at), t.date, t.id)
    from public.transaction_import_sessions s
    join public.transaction_import_rows r on r.session_id = s.id
    join public.transactions t
      on t.type = 'expense' and r.type = 'expense'
     and t.status in ('upcoming', 'overdue', 'paid')
     and t.amount = r.amount and t.currency = r.currency
     and t.date::date between r.posted_at - 3 and r.posted_at + 3
     and public.import_obligation_payee_matches(
       concat_ws(' ', r.description, r.counterparty),
       concat_ws(' ', t.description, t.counterparty)
     )
   where s.id = p_session_id and s.user_id = (select auth.uid())
     and s.status = 'preview'
     and not exists (select 1 from public.transaction_import_links l where l.transaction_id = t.id)
     and not exists (
       select 1 from public.plan_transaction_links l join public.plans p on p.id = l.plan_id
        where l.transaction_id = t.id and (r.posted_at < p.start_date or r.posted_at > p.end_date)
     )
     and (
       (t.user_id = (select auth.uid()) and (t.group_id is null or public.is_group_member(t.group_id)))
       or (t.user_id <> (select auth.uid()) and t.group_id is not null and public.is_group_co_owner(t.group_id))
     )
   group by r.id having count(*) > 1;
$$;
revoke all on function public.import_obligation_candidates(uuid) from public, anon, authenticated, service_role;

alter function public.mark_preview_duplicates(uuid) rename to mark_preview_duplicates_before_ambiguity;
revoke all on function public.mark_preview_duplicates_before_ambiguity(uuid) from public, anon, authenticated, service_role;
alter function public.preview_fingerprint_warnings(uuid) rename to preview_fingerprint_warnings_before_ambiguity;
revoke all on function public.preview_fingerprint_warnings_before_ambiguity(uuid) from public, anon, authenticated, service_role;

create function public.preview_fingerprint_warnings(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_warnings jsonb;
  v_match record;
  v_first jsonb;
begin
  -- Existing implementation authenticates and verifies session ownership.
  v_warnings := public.preview_fingerprint_warnings_before_ambiguity(p_session_id);
  for v_match in select * from public.import_obligation_candidates(p_session_id) loop
    select coalesce(jsonb_agg(w), '[]'::jsonb) into v_warnings
      from jsonb_array_elements(v_warnings) w where w->>'row_id' <> v_match.row_id::text;
    v_first := v_match.candidates->0;
    if exists (select 1 from public.transaction_import_rows r where r.id = v_match.row_id and r.obligation_match_confirmed) then
      select candidate into v_first from jsonb_array_elements(v_match.candidates) candidate
        join public.transaction_import_rows r on r.id = v_match.row_id
       where candidate->>'id' = r.duplicate_of::text;
      v_first := coalesce(v_first, v_match.candidates->0);
    end if;
    v_warnings := v_warnings || jsonb_build_object(
      'row_id', v_match.row_id,
      'duplicate_of_transaction_id', v_first->>'id',
      'duplicate_of_date', v_first->>'date',
      'duplicate_of_amount', v_first->'amount',
      'duplicate_of_currency', v_first->>'currency',
      'duplicate_of_description', v_first->>'description',
      'obligation_candidates', v_match.candidates
    );
  end loop;
  return v_warnings;
end;
$$;
revoke all on function public.preview_fingerprint_warnings(uuid) from public, anon;
grant execute on function public.preview_fingerprint_warnings(uuid) to authenticated;

create function public.mark_preview_duplicates(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_match record;
begin
  perform public.mark_preview_duplicates_before_ambiguity(p_session_id);
  for v_match in select * from public.import_obligation_candidates(p_session_id) loop
    update public.transaction_import_rows r
       set decision = 'pending', duplicate_of = null
     where r.id = v_match.row_id and r.decision in ('import', 'duplicate')
       and not r.obligation_match_confirmed;
  end loop;
  return public.preview_fingerprint_warnings(p_session_id);
end;
$$;
revoke all on function public.mark_preview_duplicates(uuid) from public, anon;
grant execute on function public.mark_preview_duplicates(uuid) to authenticated;

alter function public.commit_import_session(uuid) rename to commit_import_session_before_ambiguity;
revoke all on function public.commit_import_session_before_ambiguity(uuid) from public, anon, authenticated, service_role;
create function public.commit_import_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.import_obligation_candidates(p_session_id) c
      join public.transaction_import_rows r on r.id = c.row_id
     where r.decision = 'duplicate' and not r.obligation_match_confirmed
  ) then
    raise exception 'obligation_match_ambiguous' using errcode = 'P0001';
  end if;
  return public.commit_import_session_before_ambiguity(p_session_id);
end;
$$;
revoke all on function public.commit_import_session(uuid) from public, anon, authenticated, service_role;
grant execute on function public.commit_import_session(uuid) to authenticated, service_role;
