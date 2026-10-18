-- B1: Trusted demo identity registry + fail-closed social/admin guards.
-- Existing auth users without a registry row remain real-capable.
-- Missing auth.users row or check failure denies privileged (real-only) actions.
-- Financial RPCs are intentionally untouched.

create table public.demo_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  retired_at timestamptz null,
  constraint demo_identities_retired_after_created
    check (retired_at is null or retired_at >= created_at)
);

comment on table public.demo_identities is
  'Server-owned registry of demo Auth UIDs. Source of truth for demo capability; clients cannot write.';

alter table public.demo_identities enable row level security;

revoke all on table public.demo_identities from public, anon, authenticated;
grant select on table public.demo_identities to service_role;
grant insert, update, delete on table public.demo_identities to service_role;

-- Authenticated may read only their own row (UI DEMO badge); never write.
create policy demo_identities_select_own
  on public.demo_identities
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.demo_identities to authenticated;

create or replace function public.is_demo_account(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb;
begin
  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.demo_identities d
    where d.user_id = p_user_id
      and d.retired_at is null
  ) then
    return true;
  end if;

  select u.raw_app_meta_data
    into v_meta
  from auth.users u
  where u.id = p_user_id;

  if not found then
    return false;
  end if;

  return coalesce(v_meta ->> 'account_kind', '') = 'demo';
end;
$$;

comment on function public.is_demo_account(uuid) is
  'True when the UID is an active demo identity (registry) or durable app_metadata.account_kind=demo.';

revoke all on function public.is_demo_account(uuid) from public, anon;
grant execute on function public.is_demo_account(uuid) to authenticated, service_role;

-- Fail-closed gate for real-only actions. Errors and missing users deny access.
create or replace function public.assert_real_capable(
  p_user_id uuid default auth.uid(),
  p_reason text default 'demo_not_allowed'
)
returns void
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  begin
    select u.raw_app_meta_data
      into v_meta
    from auth.users u
    where u.id = p_user_id;
  exception
    when others then
      raise exception '%', p_reason using errcode = 'P0001';
  end;

  -- SELECT INTO sets FOUND=false when no row; NOT NULL must not be treated as success.
  if not found then
    raise exception '%', p_reason using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.demo_identities d
    where d.user_id = p_user_id
      and d.retired_at is null
  ) then
    raise exception '%', p_reason using errcode = 'P0001';
  end if;

  if coalesce(v_meta ->> 'account_kind', '') = 'demo' then
    raise exception '%', p_reason using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_real_capable(uuid, text) is
  'Deny unless the UID is a proven non-demo Auth user. Fail closed on lookup errors.';

revoke all on function public.assert_real_capable(uuid, text) from public, anon, authenticated;
grant execute on function public.assert_real_capable(uuid, text) to service_role;
-- SECURITY DEFINER social RPCs call this internally; clients do not need EXECUTE.

create or replace function public.assert_invitee_email_not_demo(p_email text)
returns void
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return;
  end if;

  if exists (
    select 1
    from public.demo_identities d
    join auth.users u on u.id = d.user_id
    where d.retired_at is null
      and lower(u.email) = v_email
  ) then
    raise exception 'demo_not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from auth.users u
    where lower(u.email) = v_email
      and coalesce(u.raw_app_meta_data ->> 'account_kind', '') = 'demo'
  ) then
    raise exception 'demo_not_allowed' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_invitee_email_not_demo(text) from public, anon, authenticated;
grant execute on function public.assert_invitee_email_not_demo(text) to service_role;

-- Service-only registration used by tests and (later) B2 provisioner.
create or replace function public.register_demo_identity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  insert into public.demo_identities (user_id)
  values (p_user_id)
  on conflict (user_id) do update
    set retired_at = null;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('account_kind', 'demo')
  where id = p_user_id;
end;
$$;

revoke all on function public.register_demo_identity(uuid) from public, anon, authenticated;
grant execute on function public.register_demo_identity(uuid) to service_role;

-- Demo accounts must never satisfy is_admin().
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
  and not public.is_demo_account((select auth.uid()));
$$;


CREATE OR REPLACE FUNCTION public.create_group(p_name text)
 RETURNS user_groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_group user_groups;
begin
  perform public.assert_real_capable(auth.uid());
  insert into user_groups (name, owner_id)
  values (p_name, auth.uid())
  returning * into v_group;

  insert into group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'owner');

  return v_group;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_group_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_invitation public.group_invitations;
begin
  perform public.assert_real_capable(auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invitation_invalid_or_expired' using errcode = 'P0001';
  end if;

  select gi.* into v_invitation
  from public.group_invitation_tokens git
  join public.group_invitations gi on gi.id = git.invitation_id
  where git.token_hash = digest(p_token, 'sha256')
  for update of gi;

  if v_invitation is null
    or v_invitation.status != 'pending'
    or v_invitation.expires_at <= now() then
    raise exception 'invitation_invalid_or_expired' using errcode = 'P0001';
  end if;
  if v_invitation.invited_user_email != v_email then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_invitation.group_id, v_uid)
  on conflict (group_id, user_id) do nothing;

  update public.group_invitations
  set status = 'accepted', invited_user_id = v_uid, updated_at = now()
  where id = v_invitation.id;

  delete from public.group_invitation_tokens where invitation_id = v_invitation.id;

  return jsonb_build_object('groupId', v_invitation.group_id, 'groupName', v_invitation.group_name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invitation public.group_invitations;
  v_caller_email text := lower((select auth.jwt() ->> 'email'));
begin
  perform public.assert_real_capable(auth.uid());
  select * into v_invitation
  from public.group_invitations
  where id = p_invitation_id
  for update;

  if v_invitation is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  if v_invitation.invited_user_email != v_caller_email then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;
  if v_invitation.status != 'pending' or v_invitation.expires_at <= now() then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_invitation.group_id, (select auth.uid()))
  on conflict (group_id, user_id) do nothing;

  update public.group_invitations
  set status = 'accepted', invited_user_id = (select auth.uid()), updated_at = now()
  where id = p_invitation_id;

  delete from public.group_invitation_tokens where invitation_id = p_invitation_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  if not exists (
    select 1 from group_members
    where group_id = p_group_id
      and user_id  = auth.uid()
  ) then
    raise exception 'not_a_member'
      using errcode = 'P0001', hint = 'User is not a member of this group.';
  end if;

  if exists (
    select 1 from user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'owner_cannot_leave'
      using errcode = 'P0001',
            hint    = 'Transfer ownership or disband the group before leaving.';
  end if;

  delete from group_members
  where group_id = p_group_id
    and user_id  = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.disband_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count_plans int;
  v_count_txs   int;
begin
  perform public.assert_real_capable(auth.uid());
  if not exists (
    select 1 from public.user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  select count(*) into v_count_plans from public.plans where group_id = p_group_id;
  select count(*) into v_count_txs   from public.transactions where group_id = p_group_id;

  if v_count_plans > 0 or v_count_txs > 0 then
    raise exception 'group_has_items'
      using errcode = 'P0001',
            hint = format('%s plan(s), %s transaction(s) still reference this group', v_count_plans, v_count_txs);
  end if;

  delete from public.user_groups where id = p_group_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_real_capable(p_user_id);
  if not exists (
    select 1 from user_groups
    where id = p_group_id and owner_id = (select auth.uid())
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001',
            hint    = 'Only the group owner can remove members.';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_remove_self'
      using errcode = 'P0001',
            hint    = 'Use leave_group to leave a group.';
  end if;

  delete from group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.nominate_group_co_owner(p_group_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_real_capable(p_user_id);
  if not is_group_owner(p_group_id) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'user_not_member' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from user_groups
    where id = p_group_id and owner_id = p_user_id
  ) then
    raise exception 'cannot_change_owner_role' using errcode = 'P0001';
  end if;

  update group_members
  set role = 'co_owner'
  where group_id = p_group_id and user_id = p_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_group_co_owner(p_group_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_real_capable(p_user_id);
  if not is_group_owner(p_group_id) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  update group_members
  set role = 'member'
  where group_id = p_group_id
    and user_id = p_user_id
    and role = 'co_owner';
end;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id uuid := auth.uid();
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_real_capable(p_new_owner_id);
  if v_caller_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  perform 1
  from public.user_groups
  where id = p_group_id
    and owner_id = v_caller_id
  for update;

  if not found then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id  = p_new_owner_id
  ) then
    raise exception 'new_owner_not_member'
      using errcode = 'P0001',
            hint    = 'The new owner must already be a member of the group.';
  end if;

  update public.group_members
  set role = 'member'
  where group_id = p_group_id
    and role = 'owner';

  update public.group_members
  set role = 'owner'
  where group_id = p_group_id
    and user_id  = p_new_owner_id;

  update public.user_groups
  set owner_id   = p_new_owner_id,
      updated_at = now()
  where id = p_group_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_admin_role(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_real_capable(p_user_id);
  if not (select is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update profiles
  set role = 'admin', updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_admin_role(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_real_capable(p_user_id);
  if not (select is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Prevent self-revocation (avoids accidental admin lockout)
  if p_user_id = auth.uid() then
    raise exception 'cannot_revoke_own_admin'
      using errcode = 'P0001',
            hint    = 'Ask another admin to revoke your role.';
  end if;

  update profiles
  set role = 'user', updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_user(p_group_id uuid, p_email text)
 RETURNS group_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_email text := lower(trim(p_email));
  v_group public.user_groups;
  v_invitation public.group_invitations;
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  perform public.assert_real_capable(auth.uid());
  perform public.assert_invitee_email_not_demo(p_email);
  select * into v_group from public.user_groups where id = p_group_id;

  if v_group is null then
    raise exception 'group_not_found' using errcode = 'P0001';
  end if;
  if v_group.owner_id != (select auth.uid()) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_email = lower(coalesce((select auth.jwt() ->> 'email'), '')) then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id and lower(p.email) = v_email
  ) then
    raise exception 'already_a_member' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.group_invitations
    where group_id = p_group_id
      and invited_user_email = v_email
      and status = 'pending'
  ) then
    raise exception 'invitation_already_pending' using errcode = 'P0001';
  end if;

  insert into public.group_invitations (
    group_id, group_name, invited_user_email, created_by, expires_at
  )
  values (p_group_id, v_group.name, v_email, (select auth.uid()), now() + interval '7 days')
  returning * into v_invitation;

  insert into public.group_invitation_tokens (invitation_id, token_hash)
  values (v_invitation.id, digest(v_token, 'sha256'));

  return v_invitation;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_group_invitation_for_delivery(p_group_id uuid, p_email text, p_invitation_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid uuid := p_actor_id;
  v_email text := lower(trim(p_email));
  v_group public.user_groups;
  v_invitation public.group_invitations;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_actor_email text;
begin
  if (select auth.role()) != 'service_role' or v_uid is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  perform public.assert_real_capable(v_uid);
  perform public.assert_invitee_email_not_demo(v_email);

  -- Serialize sends across an actor's groups to enforce quotas and avoid duplicates.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select * into v_group from public.user_groups where id = p_group_id for no key update;
  if v_group is null then
    raise exception 'group_not_found' using errcode = 'P0001';
  end if;
  if v_group.owner_id != v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  select lower(p.email) into v_actor_email
  from public.profiles p
  where p.id = v_uid;
  if v_actor_email is not null and v_email = v_actor_email then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.group_invitation_send_attempts
    where actor_id = v_uid and created_at >= now() - interval '1 hour'
  ) >= 10 then
    raise exception 'invitation_rate_limited' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id and lower(p.email) = v_email
  ) then
    raise exception 'already_a_member' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.group_invitations
    where group_id = p_group_id and invited_user_email = v_email
      and status = 'pending' and expires_at > now()
      and id is distinct from p_invitation_id
  ) then
    raise exception 'invitation_already_pending' using errcode = 'P0001';
  end if;

  if p_invitation_id is null then
    insert into public.group_invitations (
      group_id, group_name, invited_user_email, created_by, expires_at,
      delivery_status, delivery_attempts
    )
    values (
      p_group_id, v_group.name, v_email, v_uid, now() + interval '7 days',
      'pending', 1
    )
    returning * into v_invitation;
  else
    select * into v_invitation
    from public.group_invitations
    where id = p_invitation_id
    for update;

    if v_invitation is null
      or v_invitation.group_id != p_group_id
      or v_invitation.invited_user_email != v_email then
      raise exception 'invitation_not_found' using errcode = 'P0001';
    end if;
    if v_invitation.status != 'pending' then
      raise exception 'invitation_not_pending' using errcode = 'P0001';
    end if;
    if v_invitation.updated_at > now() - interval '30 seconds' then
      raise exception 'invitation_retry_too_soon' using errcode = 'P0001';
    end if;
    if v_invitation.delivery_attempts >= 5 then
      raise exception 'invitation_delivery_limit_reached' using errcode = 'P0001';
    end if;

    update public.group_invitations
    set expires_at = now() + interval '7 days',
        sent_at = null,
        delivery_status = 'pending',
        delivery_attempts = delivery_attempts + 1,
        updated_at = now()
    where id = p_invitation_id
    returning * into v_invitation;
  end if;

  insert into public.group_invitation_send_attempts(actor_id) values (v_uid);

  insert into public.group_invitation_tokens (invitation_id, token_hash)
  values (v_invitation.id, digest(v_token, 'sha256'))
  on conflict (invitation_id) do update
    set token_hash = excluded.token_hash,
        created_at = now();

  return jsonb_build_object(
    'invitation', to_jsonb(v_invitation),
    'token', v_token
  );
end;
$function$;
