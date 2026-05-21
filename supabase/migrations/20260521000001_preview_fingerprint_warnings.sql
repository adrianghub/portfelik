-- Phase 12+: bank CSV import — pre-commit probable-duplicate scan (Step 5).
--
-- Spec requires the review UI to surface "probable duplicate" warnings
-- BEFORE commit so the user can choose "Import anyway" vs "Mark as duplicate".
-- The commit RPC also returns fingerprint warnings, but those arrive too late.
--
-- This RPC is read-only: SECURITY DEFINER so it can read the caller's
-- transaction_import_links (already SELECT-granted, but keeping definer
-- semantics + tight search_path matches the commit RPC's posture and avoids
-- accidental RLS-bypass-by-omission if policies tighten later).
--
-- Returns:
--   [ { row_id: uuid, duplicate_of_transaction_id: uuid }, ... ]
--
-- Shape matches commit_import_session's fingerprint_warnings exactly so
-- both code paths stay consistent. The UI joins to its own transactions
-- query to render the existing tx's date/amount/description.
--
-- Fingerprint definition MUST match commit_import_session exactly:
--   sha256(amount | currency | description | counterparty)  (date-independent)
-- Date window matches commit_import_session: ±3 days on tx.date.

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

    v_dup_of := null;
    select l.transaction_id into v_dup_of
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
     order by t.date
     limit 1;

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
  'Bank import probable-duplicate scan, called by the review UI before commit. '
  'Read-only; matches commit_import_session fingerprint formula exactly. '
  'Returns row-level warnings with the existing tx''s date/amount/description '
  '(caller-owned, no privacy leak).';
