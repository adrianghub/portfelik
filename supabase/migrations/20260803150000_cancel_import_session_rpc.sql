-- Idempotent cancel of a preview import session for the caller.
-- Already cancelled → success. Committed/other → error. Missing/other user → not found.

create or replace function public.cancel_import_session(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select s.status
    into v_status
  from public.transaction_import_sessions s
  where s.id = p_session_id
    and s.user_id = v_uid
  for update;

  if not found then
    raise exception 'import_session_not_found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'already', true);
  end if;

  if v_status is distinct from 'preview' then
    raise exception 'import_session_not_cancellable' using errcode = 'P0001';
  end if;

  update public.transaction_import_sessions
  set status = 'cancelled'
  where id = p_session_id
    and user_id = v_uid;

  return jsonb_build_object('status', 'cancelled', 'already', false);
end;
$$;

comment on function public.cancel_import_session(uuid) is
  'Idempotently cancels the caller''s preview import session (preview→cancelled; already cancelled is success).';

revoke all on function public.cancel_import_session(uuid) from public, anon;
grant execute on function public.cancel_import_session(uuid) to authenticated;
