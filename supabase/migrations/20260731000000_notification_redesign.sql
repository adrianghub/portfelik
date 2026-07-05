-- Notification redesign: due-day-only reminders, dedup, description-first copy,
-- recurring occurrence materialization before remind, enriched actionable payloads.

-- -----------------------------------------------------------------------------
-- Shared copy helpers
-- -----------------------------------------------------------------------------
create or replace function public.notification_tx_title(
  p_description text,
  p_amount numeric,
  p_currency char(3)
)
returns text
language sql
immutable
as $$
  select left(coalesce(nullif(trim(p_description), ''), 'Transakcja'), 48)
    || ' · '
    || to_char(p_amount, 'FM999G990D00')
    || ' '
    || p_currency;
$$;

create or replace function public.notification_tx_body_due_today()
returns text
language sql
immutable
as $$
  select 'Termin: dziś';
$$;

create or replace function public.notification_tx_body_overdue(p_date date)
returns text
language sql
immutable
as $$
  select 'Po terminie od ' || to_char(p_date, 'DD.MM.YYYY');
$$;

-- -----------------------------------------------------------------------------
-- Recurring reminders: due day only + materialize occurrence + actionable data
-- -----------------------------------------------------------------------------
create or replace function public.process_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec               record;
  v_anchor          date;
  v_freq            recurrence_frequency;
  v_interval        int;
  v_target_date     date;
  v_dom             int;
  v_occurrence_id   uuid;
  v_obligation_key  text;
begin
  for rec in
    select id, user_id, amount, currency, description, counterparty, type, category_id,
           group_id, date, recurring_day, recurrence_frequency, recurrence_interval,
           recurrence_weekday, recurrence_month
    from transactions
    where is_recurring = true
      and recurrence_frequency is not null
  loop
    v_anchor   := rec.date::date;
    v_freq     := rec.recurrence_frequency;
    v_interval := greatest(coalesce(rec.recurrence_interval, 1), 1);

    if v_freq = 'daily' then
      if current_date <= v_anchor then
        v_target_date := v_anchor;
      else
        v_target_date := current_date
          + ((v_interval - ((current_date - v_anchor) % v_interval)) % v_interval);
      end if;

    elsif v_freq = 'weekly' then
      v_target_date := current_date
        + ((rec.recurrence_weekday - extract(isodow from current_date)::int + 7) % 7);
      if v_interval > 1 then
        while ((v_target_date - v_anchor) / 7) % v_interval <> 0 loop
          v_target_date := v_target_date + 7;
        end loop;
      end if;

    elsif v_freq = 'monthly' then
      v_dom := least(
        rec.recurring_day,
        extract(day from (date_trunc('month', now()) + interval '1 month - 1 day'))::int
      );
      v_target_date := make_date(
        extract(year from now())::int, extract(month from now())::int, v_dom
      );
      if v_target_date < current_date then
        v_target_date := (date_trunc('month', v_target_date)
          + (v_interval || ' month')::interval)::date;
        v_target_date := make_date(
          extract(year from v_target_date)::int,
          extract(month from v_target_date)::int,
          least(rec.recurring_day,
            extract(day from (date_trunc('month', v_target_date)
              + interval '1 month - 1 day'))::int)
        );
      end if;

    elsif v_freq = 'yearly' then
      v_dom := least(
        rec.recurring_day,
        extract(day from (make_date(extract(year from now())::int, rec.recurrence_month, 1)
          + interval '1 month - 1 day'))::int
      );
      v_target_date := make_date(extract(year from now())::int, rec.recurrence_month, v_dom);
      if v_target_date < current_date then
        v_target_date := make_date(
          extract(year from now())::int + v_interval, rec.recurrence_month, rec.recurring_day
        );
      end if;
    else
      continue;
    end if;

    -- Due day only (no day-before reminders).
    if v_target_date <> current_date then
      continue;
    end if;

    if exists (
      select 1 from notifications n
      where n.user_id = rec.user_id
        and n.type    = 'transaction_reminder'
        and n.data ->> 'templateId' = rec.id::text
        and n.data ->> 'date'       = v_target_date::text
    ) then
      continue;
    end if;

    if exists (
      select 1 from recurring_occurrence_skips s
      where s.recurring_template_id = rec.id
        and s.occurrence_date = v_target_date
    ) then
      continue;
    end if;

    v_occurrence_id := null;

    insert into transactions (
      amount, currency, counterparty, description, date, type, status,
      category_id, user_id, group_id,
      is_recurring, recurring_day,
      recurrence_frequency, recurrence_interval, recurrence_weekday, recurrence_month,
      recurring_template_id, recurring_occurrence_date
    ) values (
      abs(rec.amount), rec.currency, rec.counterparty, rec.description,
      v_target_date::timestamptz, rec.type, 'upcoming',
      rec.category_id, rec.user_id, rec.group_id,
      false, null, null, 1, null, null,
      rec.id, v_target_date
    )
    on conflict (user_id, recurring_template_id, recurring_occurrence_date) do nothing
    returning id into v_occurrence_id;

    if v_occurrence_id is null then
      select t.id into v_occurrence_id
      from transactions t
      where t.user_id = rec.user_id
        and t.recurring_template_id = rec.id
        and t.recurring_occurrence_date = v_target_date;
    end if;

    if v_occurrence_id is null then
      continue;
    end if;

    v_obligation_key := 'template:' || rec.id::text || ':' || v_target_date::text;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_reminder',
      public.notification_tx_title(rec.description, rec.amount, rec.currency),
      public.notification_tx_body_due_today(),
      jsonb_build_object(
        'actionable',       true,
        'settleKind',       'recurring_occurrence',
        'transactionId',    v_occurrence_id,
        'templateId',       rec.id,
        'occurrenceDate',   v_target_date,
        'obligationKey',    v_obligation_key,
        'amount',           rec.amount,
        'description',      rec.description,
        'date',             v_target_date,
        'isDueToday',       true
      )
    );
  end loop;
end;
$$;

comment on function public.process_recurring_transactions() is
  'Daily cron: materializes due-day recurring occurrences and sends actionable transaction_reminder notifications.';

-- -----------------------------------------------------------------------------
-- One-off status cron: due-day reminders, dedup, actionable overdue
-- -----------------------------------------------------------------------------
create or replace function public.update_transaction_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_obligation_key text;
begin
  for rec in
    select id, user_id, amount, currency, description, date
    from transactions
    where status = 'upcoming'
      and date < current_date
  loop
    update transactions
       set status = 'overdue'
     where id = rec.id;

    if exists (
      select 1 from notifications n
      where n.user_id = rec.user_id
        and n.type = 'transaction_overdue'
        and n.data ->> 'transactionId' = rec.id::text
    ) then
      continue;
    end if;

    v_obligation_key := 'tx:' || rec.id::text;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_overdue',
      public.notification_tx_title(rec.description, rec.amount, rec.currency),
      public.notification_tx_body_overdue(rec.date::date),
      jsonb_build_object(
        'actionable',    true,
        'settleKind',    'transaction',
        'transactionId', rec.id,
        'obligationKey', v_obligation_key,
        'amount',        rec.amount,
        'description',   rec.description,
        'date',          rec.date
      )
    );
  end loop;

  for rec in
    select id, user_id, amount, currency, description, date
    from transactions
    where status = 'upcoming'
      and date::date = current_date
  loop
    if exists (
      select 1 from notifications n
      where n.user_id = rec.user_id
        and n.type = 'transaction_reminder'
        and n.data ->> 'transactionId' = rec.id::text
        and n.data ->> 'date' = rec.date::date::text
    ) then
      continue;
    end if;

    v_obligation_key := 'tx:' || rec.id::text;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_reminder',
      public.notification_tx_title(rec.description, rec.amount, rec.currency),
      public.notification_tx_body_due_today(),
      jsonb_build_object(
        'actionable',    true,
        'settleKind',    'transaction',
        'transactionId', rec.id,
        'obligationKey', v_obligation_key,
        'amount',        rec.amount,
        'description',   rec.description,
        'date',          rec.date,
        'isDueToday',    true
      )
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Bank import reminder copy (JakStoimy rebrand)
-- -----------------------------------------------------------------------------
create or replace function public.process_bank_import_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_cadence_days int;
  v_latest_session_id uuid;
  v_latest_committed_at timestamptz;
  v_latest_key text;
  v_anchor_at timestamptz;
  v_elapsed_days int;
  v_window_index int;
  v_window_key text;
begin
  for rec in
    select
      p.id as user_id,
      p.created_at as profile_created_at,
      p.settings #>> '{alerts,bankImportReminder,cadenceDays}' as cadence_days_text
    from public.profiles p
    where lower(coalesce(p.settings #>> '{alerts,bankImportReminder,enabled}', 'false')) = 'true'
  loop
    v_cadence_days := case rec.cadence_days_text
      when '7' then 7
      when '14' then 14
      when '30' then 30
      else 7
    end;

    select s.id, s.committed_at
      into v_latest_session_id, v_latest_committed_at
    from public.transaction_import_sessions s
    where s.user_id = rec.user_id
      and s.status = 'committed'
    order by s.committed_at desc nulls last, s.created_at desc
    limit 1;

    v_anchor_at := coalesce(v_latest_committed_at, rec.profile_created_at);

    if v_latest_committed_at is not null
       and v_anchor_at > now() - make_interval(days => v_cadence_days) then
      continue;
    end if;

    v_latest_key := coalesce(v_latest_session_id::text, 'none');
    v_elapsed_days := greatest(0, floor(extract(epoch from (now() - v_anchor_at)) / 86400)::int);
    v_window_index := floor(v_elapsed_days::numeric / v_cadence_days)::int + 1;
    v_window_key := v_latest_key || ':' || v_cadence_days::text || ':' || v_window_index::text;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'bank_import_reminder',
      'Czas na import wyciągu',
      case
        when v_latest_committed_at is null then
          'Dodaj pierwszy wyciąg CSV z banku, żeby JakStoimy mogło pokazać aktualny obraz finansów.'
        else
          'Minął ustawiony czas od ostatniego importu. Wgraj nowy wyciąg CSV z banku.'
      end,
      jsonb_build_object(
        'type', 'bank_import_reminder',
        'actionable', false,
        'alertType', 'bank_import_reminder',
        'cadenceDays', v_cadence_days,
        'latestImportSessionId', v_latest_session_id,
        'latestImportSessionKey', v_latest_key,
        'latestImportCommittedAt', v_latest_committed_at,
        'reminderWindowKey', v_window_key
      )
    )
    on conflict (user_id, type, ((data ->> 'reminderWindowKey')))
      where data ? 'reminderWindowKey'
      do nothing;
  end loop;
end;
$$;

revoke all on function public.notification_tx_title(text, numeric, char(3)) from public;
revoke all on function public.notification_tx_body_due_today() from public;
revoke all on function public.notification_tx_body_overdue(date) from public;
grant execute on function public.notification_tx_title(text, numeric, char(3)) to service_role;
grant execute on function public.notification_tx_body_due_today() to service_role;
grant execute on function public.notification_tx_body_overdue(date) to service_role;
