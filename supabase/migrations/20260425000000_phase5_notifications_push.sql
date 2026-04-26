-- =============================================================================
-- Phase 5.1 — Notifications + Push subscriptions + pg_cron jobs
--
-- Adds the persistence layer that replaces:
--   * Firestore "notifications" collection
--   * users.fcmTokens array (replaced by VAPID push_subscriptions)
--   * Cloud Functions: processRecurringTransactions, updateTransactionStatuses,
--     onGroupInvitationCreated, onUserRoleChanged
--
-- Web-push delivery itself lands in Phase 5.2 (Edge Functions + pg_net.http_post
-- calls). This migration intentionally writes notification rows only — they act
-- as an outbox that 5.2 will drain.
-- =============================================================================


-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

create extension if not exists "pg_net";   -- outbound HTTP from triggers (used in Phase 5.2)


-- =============================================================================
-- SECTION 2: TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1  notifications
-- Mirrors the legacy Firestore "notifications" collection. Acts as the outbox
-- for push delivery (Phase 5.2 trigger sends web-push on insert).
-- -----------------------------------------------------------------------------
create table notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text        not null,
  data        jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table  notifications      is 'In-app notifications. Phase 5.2 trigger fans these out as web-push.';
comment on column notifications.type is 'transaction_summary | transaction_upcoming | transaction_overdue | transaction_reminder | group_invitation | system_notification.';
comment on column notifications.read_at is 'NULL until the user marks it read; sets the timestamp at that moment.';


-- -----------------------------------------------------------------------------
-- 2.2  push_subscriptions
-- Replaces users.fcmTokens. One row per browser/device subscription via the
-- Web Push API. Endpoint is unique per subscription — used as part of PK to
-- allow multi-device subscriptions per user.
-- -----------------------------------------------------------------------------
create table push_subscriptions (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  endpoint       text        not null,
  p256dh         text        not null,
  auth           text        not null,
  device_type    text,
  user_agent     text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz not null default now(),
  primary key (user_id, endpoint)
);

comment on table  push_subscriptions          is 'VAPID web-push subscriptions per user/device.';
comment on column push_subscriptions.endpoint is 'Browser-supplied push endpoint URL. Unique per subscription.';
comment on column push_subscriptions.p256dh   is 'Subscriber public key (base64url) used by the encryption envelope.';
comment on column push_subscriptions.auth     is 'Subscriber auth secret (base64url) used by the encryption envelope.';


-- =============================================================================
-- SECTION 3: INDEXES
-- =============================================================================

create index notifications_user_id_created_at_idx
  on notifications (user_id, created_at desc);

create index notifications_unread_idx
  on notifications (user_id, created_at desc)
  where read_at is null;


-- =============================================================================
-- SECTION 4: TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1  notifications.updated_at — none required (no updated_at column)
-- 4.2  push_subscriptions: bump last_used_at when a row is updated
-- -----------------------------------------------------------------------------
create or replace function bump_last_used_at()
returns trigger
language plpgsql
as $$
begin
  new.last_used_at := now();
  return new;
end;
$$;

create trigger push_subscriptions_bump_last_used
  before update on push_subscriptions
  for each row execute function bump_last_used_at();


-- -----------------------------------------------------------------------------
-- 4.3  group_invitations → notifications fan-out
-- Inserts a row in notifications when a new pending invitation is created.
-- Body uses the existing group_name denormalisation so we don't need a join.
-- The invited user's id may be NULL at invite time (matched by email later);
-- we look it up via auth.users to populate user_id when possible. If the
-- invitee has not signed up yet, no notification row is inserted — the
-- invitation will be discovered on first login.
-- -----------------------------------------------------------------------------
create or replace function notify_on_group_invitation()
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
  );

  return new;
end;
$$;

create trigger group_invitations_notify
  after insert on group_invitations
  for each row execute function notify_on_group_invitation();


-- -----------------------------------------------------------------------------
-- 4.4  profiles.role change → role-sync stub
-- Phase 5.1 stub. Phase 5.2 Edge Function will call auth.admin.update_user_by_id
-- to mirror role into auth.users.raw_app_meta_data so JWTs carry the claim.
-- For now we only insert a notification so the user knows their role changed.
-- -----------------------------------------------------------------------------
create or replace function notify_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    insert into notifications (user_id, type, title, body, data)
    values (
      new.id,
      'system_notification',
      'Zmiana roli',
      'Twoja rola została zmieniona na: ' || new.role::text,
      jsonb_build_object(
        'previousRole', old.role,
        'newRole',      new.role
      )
    );
  end if;
  return new;
end;
$$;

create trigger profiles_role_change_notify
  after update of role on profiles
  for each row execute function notify_on_role_change();


-- =============================================================================
-- SECTION 5: RLS POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1  notifications
-- Each user reads/updates/deletes only their own rows. INSERT is blocked from
-- clients — only SECURITY DEFINER triggers and Edge Functions (service role)
-- create rows.
-- -----------------------------------------------------------------------------
alter table notifications enable row level security;

create policy notifications_select_own
  on notifications for select
  using (user_id = (select auth.uid()));

create policy notifications_update_own
  on notifications for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own
  on notifications for delete
  using (user_id = (select auth.uid()));

create policy notifications_insert_blocked
  on notifications for insert
  with check (false);


-- -----------------------------------------------------------------------------
-- 5.2  push_subscriptions
-- Each user manages their own subscriptions only.
-- -----------------------------------------------------------------------------
alter table push_subscriptions enable row level security;

create policy push_subscriptions_select_own
  on push_subscriptions for select
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own
  on push_subscriptions for insert
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_update_own
  on push_subscriptions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own
  on push_subscriptions for delete
  using (user_id = (select auth.uid()));


-- =============================================================================
-- SECTION 6: RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1  mark_notification_read(notification_id)
-- Convenience RPC; sets read_at = now() if currently NULL.
-- -----------------------------------------------------------------------------
create or replace function mark_notification_read(p_notification_id uuid)
returns void
language sql
security invoker
as $$
  update notifications
     set read_at = now()
   where id = p_notification_id
     and user_id = (select auth.uid())
     and read_at is null;
$$;

-- -----------------------------------------------------------------------------
-- 6.2  mark_all_notifications_read()
-- -----------------------------------------------------------------------------
create or replace function mark_all_notifications_read()
returns void
language sql
security invoker
as $$
  update notifications
     set read_at = now()
   where user_id = (select auth.uid())
     and read_at is null;
$$;


-- =============================================================================
-- SECTION 7: pg_cron JOBS
--
-- Schedules are in UTC. Europe/Warsaw is UTC+1 winter / UTC+2 summer; the
-- 1-hour DST drift is acceptable for these jobs. If exact local time becomes
-- important, switch to cron.schedule_in_database() with the timezone arg.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1  process_recurring_transactions
-- Replaces Cloud Function processRecurringTransactions (cron 0 0 1 * * Warsaw).
-- For each is_recurring=true template, creates this month's instance with
-- status='upcoming' if one does not already exist for the same
-- (user_id, description, amount, category_id, target month). Inserts a
-- notification row per created transaction.
-- Runs at 23:00 UTC on the 1st of each month → 00:00 / 01:00 Warsaw.
-- -----------------------------------------------------------------------------
create or replace function process_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_target_date date;
  v_inserted_id uuid;
begin
  for rec in
    select id, user_id, amount, currency, description, type,
           category_id, recurring_day
    from transactions
    where is_recurring = true
  loop
    -- compose this month's date at the recurring day; if the day is past
    -- already this month, schedule for next month (matches old Node logic).
    v_target_date := make_date(
      extract(year from now())::int,
      extract(month from now())::int,
      least(rec.recurring_day, extract(day from
        (date_trunc('month', now()) + interval '1 month - 1 day')::date)::int)
    );

    if v_target_date < current_date then
      v_target_date := (v_target_date + interval '1 month')::date;
    end if;

    -- skip if a matching upcoming row already exists for the target month
    if exists (
      select 1 from transactions t
      where t.user_id        = rec.user_id
        and t.description    = rec.description
        and t.amount         = rec.amount
        and t.category_id    = rec.category_id
        and t.status         = 'upcoming'
        and t.date >= date_trunc('month', v_target_date)
        and t.date <  date_trunc('month', v_target_date) + interval '1 month'
    ) then
      continue;
    end if;

    insert into transactions (
      amount, currency, description, date, type, status,
      category_id, user_id, is_recurring, recurring_day
    )
    values (
      rec.amount, rec.currency, rec.description, v_target_date, rec.type,
      'upcoming', rec.category_id, rec.user_id, false, null
    )
    returning id into v_inserted_id;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_upcoming',
      'Nadchodząca transakcja',
      rec.description || ' — ' || to_char(rec.amount, 'FM999G990D00') || ' ' || rec.currency,
      jsonb_build_object(
        'transactionId', v_inserted_id,
        'amount',        rec.amount,
        'description',   rec.description,
        'date',          v_target_date
      )
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.2  update_transaction_statuses
-- Replaces Cloud Function updateTransactionStatuses (cron 0 6 * * * Warsaw).
-- Flips upcoming → overdue when the date is past, and creates reminder
-- notifications for items due today/tomorrow.
-- Runs at 05:00 UTC daily → 06:00 / 07:00 Warsaw.
-- -----------------------------------------------------------------------------
create or replace function update_transaction_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  -- 1. Mark overdue and notify
  for rec in
    select id, user_id, amount, currency, description, date
    from transactions
    where status = 'upcoming'
      and date < current_date
  loop
    update transactions
       set status = 'overdue'
     where id = rec.id;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_overdue',
      'Transakcja przeterminowana',
      rec.description || ' — ' || to_char(rec.amount, 'FM999G990D00') || ' ' || rec.currency,
      jsonb_build_object(
        'transactionId', rec.id,
        'amount',        rec.amount,
        'description',   rec.description,
        'date',          rec.date
      )
    );
  end loop;

  -- 2. Reminders for upcoming transactions due today or tomorrow
  for rec in
    select id, user_id, amount, currency, description, date
    from transactions
    where status = 'upcoming'
      and date >= current_date
      and date <  current_date + interval '2 days'
  loop
    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_reminder',
      case
        when rec.date::date = current_date then 'Transakcja na dziś'
        else                                    'Transakcja na jutro'
      end,
      rec.description || ' — ' || to_char(rec.amount, 'FM999G990D00') || ' ' || rec.currency,
      jsonb_build_object(
        'transactionId', rec.id,
        'amount',        rec.amount,
        'description',   rec.description,
        'date',          rec.date,
        'isDueToday',    (rec.date::date = current_date)
      )
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7.3  Schedule the jobs
-- Cron entries are idempotent if the names are unique; cron.schedule replaces
-- an existing job with the same name.
-- -----------------------------------------------------------------------------
select cron.schedule(
  'process-recurring-transactions',
  '0 23 1 * *',                                  -- 23:00 UTC on the 1st
  $$ select public.process_recurring_transactions(); $$
);

select cron.schedule(
  'update-transaction-statuses',
  '0 5 * * *',                                   -- 05:00 UTC daily
  $$ select public.update_transaction_statuses(); $$
);

-- send-admin-summary cron is added in Phase 5.2 (depends on Edge Function).


-- =============================================================================
-- SECTION 8: GRANTS
-- =============================================================================

grant execute on function mark_notification_read       to authenticated;
grant execute on function mark_all_notifications_read  to authenticated;

-- The cron functions are intentionally NOT granted to authenticated — they
-- only run via pg_cron's superuser context.
