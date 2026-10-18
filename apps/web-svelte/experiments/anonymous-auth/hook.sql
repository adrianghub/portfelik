-- LOCAL EXPERIMENT ONLY. Not a migration and never installed by application startup.
create schema demo_auth_poc;
revoke all on schema demo_auth_poc from public, anon, authenticated;
grant usage on schema demo_auth_poc to supabase_auth_admin;
create table demo_auth_poc.policy (mode text not null);
insert into demo_auth_poc.policy values ('strict');
create table demo_auth_poc.grants (
  digest text primary key,
  email text not null,
  invitation_id uuid not null references public.group_invitations(id),
  operation text not null check (operation = 'create_invited_user'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_user_id uuid
);
create table demo_auth_poc.calls (user_id uuid, provider text, is_anonymous boolean);
alter table demo_auth_poc.policy enable row level security;
alter table demo_auth_poc.grants enable row level security;
alter table demo_auth_poc.calls enable row level security;
create policy auth_read_policy on demo_auth_poc.policy for select to supabase_auth_admin using (true);
create policy auth_consume_grant on demo_auth_poc.grants for all to supabase_auth_admin using (true) with check (true);
create policy auth_record_call on demo_auth_poc.calls for insert to supabase_auth_admin with check (true);
grant select on demo_auth_poc.policy to supabase_auth_admin;
grant select, update on demo_auth_poc.grants to supabase_auth_admin;
grant insert on demo_auth_poc.calls to supabase_auth_admin;
-- Only the isolated schema copy: trusted Auth process may revalidate an invitation.
grant usage on schema public to supabase_auth_admin;
grant select (id, invited_user_email, status, expires_at) on public.group_invitations to supabase_auth_admin;
create policy poc_auth_invitation_check on public.group_invitations for select to supabase_auth_admin using (true);

create function demo_auth_poc.before_user_created(event jsonb)
returns jsonb language plpgsql security invoker
set search_path = ''
as $$
declare
  mode text;
  provider text := event->'user'->'app_metadata'->>'provider';
  v_email text := lower(event->'user'->>'email');
  nonce text := event->'user'->'user_metadata'->>'poc_creation_grant';
  consumed text;
begin
  select p.mode into strict mode from demo_auth_poc.policy p;
  if mode = 'exception' then raise exception 'intentional_poc_failure'; end if;
  if mode = 'timeout' then perform pg_catalog.pg_sleep(10); end if;
  if mode = 'malformed' then return '[]'::jsonb; end if;
  insert into demo_auth_poc.calls values (
    (event->'user'->>'id')::uuid, provider,
    coalesce((event->'user'->>'is_anonymous')::boolean, false)
  );
  -- This boolean is supplied by GoTrue, not read from user_metadata.
  if event->'user'->'is_anonymous' = 'true'::jsonb
     and coalesce(v_email, '') = '' and provider is null then
    return '{}'::jsonb;
  end if;
  if mode = 'grants' and provider = 'email' and length(nonce) = 64 then
    update demo_auth_poc.grants g
    set consumed_at = pg_catalog.clock_timestamp(), created_user_id = (event->'user'->>'id')::uuid
    from public.group_invitations gi
    where g.digest = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(nonce, 'UTF8')), 'hex')
      and g.email = v_email and g.expires_at > pg_catalog.clock_timestamp()
      and g.operation = 'create_invited_user' and g.consumed_at is null
      and gi.id = g.invitation_id and lower(gi.invited_user_email) = v_email
      and gi.status = 'pending' and gi.expires_at > pg_catalog.clock_timestamp()
    returning g.digest into consumed;
    if consumed is not null then return '{}'::jsonb; end if;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Account creation is not authorized.'
  ));
end;
$$;
revoke all on function demo_auth_poc.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function demo_auth_poc.before_user_created(jsonb) to supabase_auth_admin;
