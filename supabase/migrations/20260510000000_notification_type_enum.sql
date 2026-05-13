-- Phase 10 W6c: notifications.type → Postgres enum
-- Production notifications table is currently empty (confirmed pre-plan),
-- so a direct USING cast is safe.
create type public.notification_type as enum (
  'transaction_summary',
  'transaction_upcoming',
  'transaction_overdue',
  'transaction_reminder',
  'group_invitation',
  'system_notification'
);

alter table public.notifications
  alter column type type public.notification_type
  using type::public.notification_type;
