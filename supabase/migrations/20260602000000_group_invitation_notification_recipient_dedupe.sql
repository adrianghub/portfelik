-- The signup/email-change backfill can legitimately notify more than one
-- recipient for the same still-pending invitation if an invited email moves
-- from one auth user to another. Dedupe per recipient, not per invitation.

drop index if exists public.notifications_group_invitation_invitation_id_key;

create unique index if not exists notifications_group_invitation_user_invitation_key
  on public.notifications (user_id, (data ->> 'invitationId'))
  where type = 'group_invitation'
    and data ? 'invitationId';
