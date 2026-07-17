-- P0-2D: product-local (Europe/Warsaw) recurrence cron + per-template isolation.

create or replace function public.product_local_date(p_at timestamptz default now())
returns date
language sql
stable
as $$
  select (timezone('Europe/Warsaw', p_at))::date;
$$;

comment on function public.product_local_date(timestamptz) is
  'Product calendar date in Europe/Warsaw. Recurring due-day checks use this, not DB current_date.';

revoke all on function public.product_local_date(timestamptz) from public, anon;
grant execute on function public.product_local_date(timestamptz) to authenticated, service_role;

create or replace function public.process_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec               record;
  v_today           date := public.product_local_date();
  v_anchor          date;
  v_target_date     date;
  v_occurrence_id   uuid;
  v_obligation_key  text;
begin
  for rec in
    select id, user_id, amount, currency, description, counterparty, type, category_id,
           group_id, date, recurring_day, recurrence_frequency, recurrence_interval,
           recurrence_weekday, recurrence_month, recurrence_end_date
    from transactions
    where is_recurring = true
      and recurrence_frequency is not null
  loop
    begin
      v_anchor := rec.date::date;

      if not public.recurring_occurrence_on_date(
        v_anchor,
        rec.recurrence_frequency,
        rec.recurrence_interval,
        rec.recurrence_weekday,
        rec.recurrence_month,
        rec.recurring_day,
        v_today,
        rec.recurrence_end_date
      ) then
        continue;
      end if;

      v_target_date := v_today;

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
      on conflict on constraint transactions_recurring_occurrence_logical_unique do nothing
      returning id into v_occurrence_id;

      if v_occurrence_id is null then
        select t.id into v_occurrence_id
        from transactions t
        where t.recurring_template_id = rec.id
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
    exception
      when others then
        -- One malformed template must not abort the rest of the cron run.
        raise warning 'process_recurring_transactions: template % skipped: %',
          rec.id, sqlerrm;
    end;
  end loop;
end;
$$;

comment on function public.process_recurring_transactions() is
  'Daily cron (Europe/Warsaw product date): materializes due-day recurring occurrences and sends actionable reminders. Per-template exceptions are isolated.';

-- Reschedule: local midnight Warsaw when cron.job.timezone is available; else keep UTC slot.
do $body$
declare
  v_has_timezone boolean;
begin
  begin
    perform cron.unschedule('process-recurring-transactions');
  exception
    when others then null;
  end;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'cron'
      and table_name = 'job'
      and column_name = 'timezone'
  ) into v_has_timezone;

  if v_has_timezone then
    perform cron.schedule(
      'process-recurring-transactions',
      '5 0 * * *',
      $cron$select public.process_recurring_transactions();$cron$
    );
    update cron.job
    set timezone = 'Europe/Warsaw'
    where jobname = 'process-recurring-transactions';
  else
    -- Fallback: 23:05 UTC ≈ 00:05 Warsaw in winter; summer 01:05. Date math uses Warsaw either way.
    perform cron.schedule(
      'process-recurring-transactions',
      '5 23 * * *',
      $cron$select public.process_recurring_transactions();$cron$
    );
  end if;
end;
$body$;
