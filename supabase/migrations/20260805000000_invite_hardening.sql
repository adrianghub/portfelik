-- Invite hardening: self-invite via actor profile email; revoke direct invite_user
-- from authenticated (delivery goes through send-group-invitation Edge Function only).

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
  v_actor_email text;
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

  select lower(p.email) into v_actor_email
  from public.profiles p
  where p.id = v_uid;
  if v_actor_email is not null and v_email = v_actor_email then
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

revoke execute on function public.invite_user(uuid, text) from authenticated, anon, public;
grant execute on function public.invite_user(uuid, text) to service_role;

comment on function public.invite_user(uuid, text) is
  'Legacy invite RPC. Not callable by clients; use send-group-invitation Edge Function.';

-- Access rate limit: count by token hash without revealing whether the token exists.
-- Unknown tokens still consume budget; callers get a uniform denial from the Edge Function.
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
