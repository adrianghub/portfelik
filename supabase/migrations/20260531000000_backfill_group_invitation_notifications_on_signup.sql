-- Backfill group-invitation notifications when an invitee signs up after the
-- invitation was created. The original INSERT trigger only notified users that
-- already existed in auth.users at invite time; pending invites sent to a new
-- email were only discoverable by opening Settings -> Groups.

create unique index if not exists notifications_group_invitation_invitation_id_key
  on public.notifications ((data ->> 'invitationId'))
  where type = 'group_invitation'
    and data ? 'invitationId';

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
  if new.status <> 'pending' then
    return new;
  end if;

  select id into v_invitee_id
  from auth.users
  where lower(email) = lower(new.invited_user_email)
  limit 1;

  if v_invitee_id is null then
    return new;
  end if;

  select email into v_inviter_email
  from auth.users
  where id = new.created_by
  limit 1;

  insert into notifications (user_id, type, title, body, data)
  values (
    v_invitee_id,
    'group_invitation',
    'Zaproszenie do grupy',
    coalesce(v_inviter_email, 'Ktoś') || ' zaprosił Cię do grupy "' || new.group_name || '"',
    jsonb_build_object(
      'invitationId', new.id,
      'groupId',      new.group_id,
      'groupName',    new.group_name,
      'invitedBy',    new.created_by
    )
  )
  on conflict do nothing;

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
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  insert into notifications (user_id, type, title, body, data)
  select
    new.id,
    'group_invitation',
    'Zaproszenie do grupy',
    coalesce(inviter.email, 'Ktoś') || ' zaprosił Cię do grupy "' || gi.group_name || '"',
    jsonb_build_object(
      'invitationId', gi.id,
      'groupId',      gi.group_id,
      'groupName',    gi.group_name,
      'invitedBy',    gi.created_by
    )
  from group_invitations gi
  left join auth.users inviter on inviter.id = gi.created_by
  where gi.status = 'pending'
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
  update profiles
  set email      = new.email,
      updated_at = now()
  where id = new.id;

  insert into notifications (user_id, type, title, body, data)
  select
    new.id,
    'group_invitation',
    'Zaproszenie do grupy',
    coalesce(inviter.email, 'Ktoś') || ' zaprosił Cię do grupy "' || gi.group_name || '"',
    jsonb_build_object(
      'invitationId', gi.id,
      'groupId',      gi.group_id,
      'groupName',    gi.group_name,
      'invitedBy',    gi.created_by
    )
  from group_invitations gi
  left join auth.users inviter on inviter.id = gi.created_by
  where gi.status = 'pending'
    and lower(gi.invited_user_email) = lower(new.email)
  on conflict do nothing;

  return new;
end;
$$;
