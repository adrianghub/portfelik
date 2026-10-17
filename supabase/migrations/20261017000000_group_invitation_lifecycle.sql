-- Delivery quotas survive deletion of history. No recipient email or token PII.
create table public.group_invitation_send_attempts (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index group_invitation_send_attempts_actor_date_idx
  on public.group_invitation_send_attempts(actor_id, created_at);
alter table public.group_invitation_send_attempts enable row level security;
revoke all on public.group_invitation_send_attempts from public, anon, authenticated;
revoke all on sequence public.group_invitation_send_attempts_id_seq from public, anon, authenticated;
grant all on public.group_invitation_send_attempts to service_role;
grant usage, select on sequence public.group_invitation_send_attempts_id_seq to service_role;

insert into public.group_invitation_send_attempts(actor_id, created_at)
select created_by, created_at from public.group_invitations
where created_at >= now() - interval '1 hour';

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
$$;

-- Terminal transitions invalidate links and dismiss stale invitation notifications.
create or replace function public.consume_group_invitation_token()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status != 'pending' then
    delete from public.group_invitation_tokens where invitation_id = new.id;
    delete from public.notifications
    where type = 'group_invitation' and data ->> 'invitationId' = new.id::text;
  end if;
  return new;
end;
$$;

create or replace function public.reject_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.group_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_invitation from public.group_invitations where id = p_invitation_id for update;
  if v_invitation is null then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.invited_user_email is distinct from lower((select auth.jwt() ->> 'email')) then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;
  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  update public.group_invitations set status = 'rejected', updated_at = now() where id = p_invitation_id;
end;
$$;

revoke all on function public.reject_invitation(uuid) from public, anon;
grant execute on function public.reject_invitation(uuid) to authenticated;

create or replace function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.group_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_invitation from public.group_invitations where id = p_invitation_id for update;
  if v_invitation is null then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.created_by is distinct from v_uid and not exists (
    select 1 from public.user_groups where id = v_invitation.group_id and owner_id = v_uid
  ) then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  update public.group_invitations set status = 'cancelled', updated_at = now() where id = p_invitation_id;
end;
$$;

revoke all on function public.cancel_invitation(uuid) from public, anon;
grant execute on function public.cancel_invitation(uuid) to authenticated;

create or replace function public.delete_group_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.group_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_invitation from public.group_invitations where id = p_invitation_id for update;
  if v_invitation is null then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.created_by is distinct from v_uid and not exists (
    select 1 from public.user_groups where id = v_invitation.group_id and owner_id = v_uid
  ) then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if v_invitation.status = 'pending' and v_invitation.expires_at > now() then
    raise exception 'invitation_still_pending' using errcode = 'P0001';
  end if;
  -- Token hashes cascade; accepted membership stays intact.
  delete from public.group_invitations where id = p_invitation_id;
end;
$$;

revoke all on function public.delete_group_invitation(uuid) from public, anon;
grant execute on function public.delete_group_invitation(uuid) to authenticated;


create or replace function public.cleanup_deleted_group_invitation_notifications()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.notifications
  where type = 'group_invitation' and data ->> 'invitationId' = old.id::text;
  return old;
end;
$$;
revoke all on function public.cleanup_deleted_group_invitation_notifications() from public, anon, authenticated;
create trigger cleanup_deleted_group_invitation_notifications
after delete on public.group_invitations for each row
execute function public.cleanup_deleted_group_invitation_notifications();

-- Remove existing actionable notifications whose invitations can no longer be claimed.
delete from public.notifications n
where n.type = 'group_invitation' and not exists (
  select 1 from public.group_invitations gi
  where gi.id::text = n.data ->> 'invitationId'
    and gi.status = 'pending' and gi.expires_at > now()
);
