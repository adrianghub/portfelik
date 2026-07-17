-- Expiring, tokenized group invitations with server-side delivery state.
-- Raw claim tokens are returned once by an RPC and never stored.

alter table public.group_invitations
  add column expires_at timestamptz,
  add column sent_at timestamptz,
  add column delivery_status text not null default 'pending',
  add column delivery_attempts integer not null default 0;

update public.group_invitations
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.group_invitations
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '7 days'),
  add constraint group_invitations_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed')),
  add constraint group_invitations_delivery_attempts_check
    check (delivery_attempts >= 0);

create index group_invitations_pending_expiry_idx
  on public.group_invitations (invited_user_email, expires_at)
  where status = 'pending';

create table public.group_invitation_tokens (
  invitation_id uuid primary key
    references public.group_invitations(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);

alter table public.group_invitation_tokens enable row level security;
revoke all on public.group_invitation_tokens from public, anon, authenticated;
grant all on public.group_invitation_tokens to service_role;

comment on table public.group_invitation_tokens is
  'Private one-time invitation token hashes. No Data API access; use invitation RPCs.';

create or replace function public.invite_user(p_group_id uuid, p_email text)
returns public.group_invitations
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_group public.user_groups;
  v_invitation public.group_invitations;
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
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
$$;

create or replace function public.create_group_invitation_for_delivery(
  p_group_id uuid,
  p_email text,
  p_invitation_id uuid default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := p_actor_id;
  v_email text := lower(trim(p_email));
  v_group public.user_groups;
  v_invitation public.group_invitations;
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if (select auth.role()) != 'service_role' or v_uid is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_group from public.user_groups where id = p_group_id;
  if v_group is null then
    raise exception 'group_not_found' using errcode = 'P0001';
  end if;
  if v_group.owner_id != v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_email = lower(coalesce((select auth.jwt() ->> 'email'), '')) then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;

  if p_invitation_id is null then
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
    if (
      select count(*) from public.group_invitations
      where created_by = v_uid and created_at >= now() - interval '1 hour'
    ) >= 10 then
      raise exception 'invitation_rate_limited' using errcode = 'P0001';
    end if;

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
      or v_invitation.created_by != v_uid
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
$$;

create or replace function public.get_group_invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select jsonb_build_object(
    'groupName', gi.group_name,
    'inviterName', coalesce(nullif(trim(p.name), ''), 'Użytkownik JakStoimy'),
    'recipientMasked', regexp_replace(gi.invited_user_email, '(^.).*(@.*$)', '\1***\2'),
    'expiresAt', gi.expires_at
  )
  into v_result
  from public.group_invitation_tokens git
  join public.group_invitations gi on gi.id = git.invitation_id
  left join public.profiles p on p.id = gi.created_by
  where git.token_hash = digest(p_token, 'sha256')
    and gi.status = 'pending'
    and gi.expires_at > now();

  return v_result;
end;
$$;

create or replace function public.claim_group_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_invitation public.group_invitations;
begin
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
$$;

create or replace function public.record_group_invitation_delivery(
  p_invitation_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) != 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_outcome not in ('sent', 'failed') then
    raise exception 'invalid_delivery_outcome' using errcode = 'P0001';
  end if;

  update public.group_invitations
  set delivery_status = p_outcome,
      sent_at = case when p_outcome = 'sent' then now() else null end,
      updated_at = now()
  where id = p_invitation_id and status = 'pending';
end;
$$;

create or replace function public.verify_group_invitation_recipient(p_token text, p_email text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
begin
  if (select auth.role()) != 'service_role' then return false; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  return exists (
    select 1 from public.group_invitation_tokens git
    join public.group_invitations gi on gi.id = git.invitation_id
    where git.token_hash = digest(p_token, 'sha256')
      and gi.status = 'pending' and gi.expires_at > now()
      and gi.invited_user_email = lower(trim(p_email))
  );
end;
$$;

create or replace function public.accept_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.group_invitations;
  v_caller_email text := lower((select auth.jwt() ->> 'email'));
begin
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
$$;

create or replace function public.consume_group_invitation_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status != 'pending' then
    delete from public.group_invitation_tokens where invitation_id = new.id;
  end if;
  return new;
end;
$$;

create trigger consume_group_invitation_token_on_status
after update of status on public.group_invitations
for each row
when (new.status != 'pending')
execute function public.consume_group_invitation_token();

create or replace function public.notify_on_group_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitee_id uuid;
  v_inviter_email text;
begin
  if new.status <> 'pending' or new.expires_at <= now() then return new; end if;
  select id into v_invitee_id from auth.users
  where lower(email) = lower(new.invited_user_email) limit 1;
  if v_invitee_id is null then return new; end if;
  select email into v_inviter_email from auth.users where id = new.created_by limit 1;
  insert into notifications (user_id, type, title, body, data)
  values (
    v_invitee_id, 'group_invitation', 'Zaproszenie do grupy',
    coalesce(v_inviter_email, 'Ktoś') || ' zaprosił Cię do grupy "' || new.group_name || '"',
    jsonb_build_object('invitationId', new.id, 'groupId', new.group_id,
      'groupName', new.group_name, 'invitedBy', new.created_by)
  ) on conflict do nothing;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  insert into notifications (user_id, type, title, body, data)
  select new.id, 'group_invitation', 'Zaproszenie do grupy',
    coalesce(inviter.email, 'Ktoś') || ' zaprosił Cię do grupy "' || gi.group_name || '"',
    jsonb_build_object('invitationId', gi.id, 'groupId', gi.group_id,
      'groupName', gi.group_name, 'invitedBy', gi.created_by)
  from group_invitations gi
  left join auth.users inviter on inviter.id = gi.created_by
  where gi.status = 'pending' and gi.expires_at > now()
    and lower(gi.invited_user_email) = lower(new.email)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set email = new.email, updated_at = now() where id = new.id;
  insert into notifications (user_id, type, title, body, data)
  select new.id, 'group_invitation', 'Zaproszenie do grupy',
    coalesce(inviter.email, 'Ktoś') || ' zaprosił Cię do grupy "' || gi.group_name || '"',
    jsonb_build_object('invitationId', gi.id, 'groupId', gi.group_id,
      'groupName', gi.group_name, 'invitedBy', gi.created_by)
  from group_invitations gi
  left join auth.users inviter on inviter.id = gi.created_by
  where gi.status = 'pending' and gi.expires_at > now()
    and lower(gi.invited_user_email) = lower(new.email)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.enforce_max_user_cap()
returns trigger
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_cap_text text;
  v_cap int;
  v_count int;
  v_has_pending_invitation boolean;
begin
  select decrypted_secret into v_cap_text
  from vault.decrypted_secrets
  where name = 'max_user_cap'
  limit 1;

  if v_cap_text is null then return new; end if;
  begin
    v_cap := v_cap_text::int;
  exception when others then
    raise exception 'max_user_cap_invalid: vault value % is not an integer', v_cap_text
      using errcode = 'invalid_parameter_value';
  end;
  if v_cap < 0 then
    raise exception 'max_user_cap_negative: vault value % must be non-negative', v_cap
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtext('max_user_cap'));
  select exists (
    select 1 from public.group_invitations gi
    where gi.status = 'pending'
      and gi.expires_at > now()
      and lower(gi.invited_user_email) = lower(new.email)
  ) into v_has_pending_invitation;

  if v_has_pending_invitation then return new; end if;
  select count(*) into v_count from auth.users;
  if v_count >= v_cap then
    raise exception 'max_user_cap_reached: account creation blocked (cap=%, current=%)', v_cap, v_count
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.create_group_invitation_for_delivery(uuid, text, uuid, uuid) from public;
revoke all on function public.get_group_invitation_preview(text) from public;
revoke all on function public.claim_group_invitation(text) from public;
revoke all on function public.record_group_invitation_delivery(uuid, text) from public;
revoke all on function public.verify_group_invitation_recipient(text, text) from public, anon, authenticated;
revoke all on function public.consume_group_invitation_token() from public;

grant execute on function public.create_group_invitation_for_delivery(uuid, text, uuid, uuid) to service_role;
grant execute on function public.get_group_invitation_preview(text) to anon, authenticated;
grant execute on function public.claim_group_invitation(text) to authenticated;
grant execute on function public.record_group_invitation_delivery(uuid, text) to service_role;
grant execute on function public.verify_group_invitation_recipient(text, text) to service_role;
