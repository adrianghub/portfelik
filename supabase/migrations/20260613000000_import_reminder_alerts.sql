-- Import reminder alerts.
--
-- Alerts decide whether notification rows are created. Push remains only the
-- delivery channel for users who enabled browser push on a given device.

alter type public.notification_type add value if not exists 'bank_import_reminder';

create unique index if not exists notifications_bank_import_reminder_window_key
  on public.notifications (
    user_id,
    type,
    ((data ->> 'reminderWindowKey'))
  )
  where data ? 'reminderWindowKey';

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
          'Dodaj pierwszy wyciąg CSV z banku, żeby Portfelik mógł pokazać aktualny obraz finansów.'
        else
          'Minął ustawiony czas od ostatniego importu. Wgraj nowy wyciąg CSV z banku.'
      end,
      jsonb_build_object(
        'type', 'bank_import_reminder',
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

comment on function public.process_bank_import_reminders() is
  'Daily alert producer for opt-in bank CSV import reminders. Inserts at most one reminder per user and configured cadence window.';

select cron.schedule(
  'process-bank-import-reminders',
  '0 8 * * *',
  $$ select public.process_bank_import_reminders(); $$
);

revoke all on function public.process_bank_import_reminders() from public;
revoke all on function public.process_bank_import_reminders() from anon;
revoke all on function public.process_bank_import_reminders() from authenticated;
grant execute on function public.process_bank_import_reminders() to service_role;
