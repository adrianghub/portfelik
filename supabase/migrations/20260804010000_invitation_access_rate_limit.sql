-- Durable rate limit for unauthenticated invitation `access` (magic-link) requests.
-- Caps at 5 attempts per invitation token hash per rolling hour.

create table if not exists public.group_invitation_access_attempts (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists group_invitation_access_attempts_hash_created_idx
  on public.group_invitation_access_attempts (token_hash, created_at desc);

alter table public.group_invitation_access_attempts enable row level security;

revoke all on table public.group_invitation_access_attempts from public, anon, authenticated;
grant all on table public.group_invitation_access_attempts to service_role;

comment on table public.group_invitation_access_attempts is
  'Service-role-only audit of invitation access (magic-link) attempts for rate limiting.';

create or replace function public.record_group_invitation_access_attempt(
  p_token text,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash bytea := digest(p_token, 'sha256');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count integer;
begin
  if p_token is null or length(p_token) < 16 or v_email = '' then
    return false;
  end if;

  -- Only count attempts against a known invitation token.
  if not exists (
    select 1 from public.group_invitation_tokens t where t.token_hash = v_hash
  ) then
    return false;
  end if;

  select count(*)::integer into v_count
  from public.group_invitation_access_attempts
  where token_hash = v_hash
    and created_at >= now() - interval '1 hour';

  if v_count >= 5 then
    return false;
  end if;

  insert into public.group_invitation_access_attempts (token_hash, email)
  values (v_hash, v_email);

  return true;
end;
$$;

revoke all on function public.record_group_invitation_access_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.record_group_invitation_access_attempt(text, text)
  to service_role;

comment on function public.record_group_invitation_access_attempt(text, text) is
  'Service-role: record invitation access attempt; false when rate-limited or token unknown.';
