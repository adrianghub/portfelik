-- Serialize the existing quota check so parallel access requests cannot bypass it.
create or replace function public.record_group_invitation_access_attempt(p_token text, p_email text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash bytea := digest(p_token, 'sha256');
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or v_email = '' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(encode(v_hash, 'hex'), 0));
  if (select count(*) from public.group_invitation_access_attempts
      where token_hash = v_hash and created_at >= now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into public.group_invitation_access_attempts(token_hash, email) values (v_hash, v_email);
  return true;
end;
$$;
revoke all on function public.record_group_invitation_access_attempt(text, text) from public, anon, authenticated;
grant execute on function public.record_group_invitation_access_attempt(text, text) to service_role;
