-- Recurring transactions: reminder-only, no row materialization.
--
-- Until now the daily cron cloned every `is_recurring` template into a new
-- `upcoming` transaction row. Two flaws made this feel out of the user's
-- control: the first instance could land on the very day the template itself
-- covers (same-day duplicate of an already-paid rata), and the clone carried
-- no recurrence flag or template reference, so nothing in the UI explained
-- where it came from. The day after, update_transaction_statuses flipped the
-- phantom row to `overdue` and alerted the user about a payment they had
-- already made.
--
-- Product doctrine: financial truth comes from import or explicit manual
-- entry; plans and recurrence express intent. So the scheduler now only
-- *reminds*: it computes each template's next occurrence (same date math as
-- before) and sends a `transaction_reminder` notification when that occurrence
-- is today or tomorrow. No transaction rows are created. Existing push fan-out
-- (after-insert trigger on notifications) delivers the reminder unchanged.
--
-- The cron schedule is untouched ('process-recurring-transactions', 23:00 UTC
-- daily). EXECUTE grants are preserved by CREATE OR REPLACE (revoked from
-- authenticated in 20260529).

-- Dedupe lookup: one reminder per template per occurrence date.
create index if not exists idx_notifications_recurring_reminder
  on public.notifications (user_id, (data ->> 'templateId'), (data ->> 'date'))
  where type = 'transaction_reminder';

create or replace function public.process_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec           record;
  v_anchor      date;
  v_freq        recurrence_frequency;
  v_interval    int;
  v_target_date date;
  v_dom         int;     -- clamped day-of-month
begin
  for rec in
    select id, user_id, amount, currency, description, type, category_id,
           date, recurring_day, recurrence_frequency, recurrence_interval,
           recurrence_weekday, recurrence_month
    from transactions
    where is_recurring = true
      and recurrence_frequency is not null
  loop
    v_anchor   := rec.date::date;
    v_freq     := rec.recurrence_frequency;
    v_interval := greatest(coalesce(rec.recurrence_interval, 1), 1);

    if v_freq = 'daily' then
      -- smallest date >= today congruent to the anchor modulo the interval
      if current_date <= v_anchor then
        v_target_date := v_anchor;
      else
        v_target_date := current_date
          + ((v_interval - ((current_date - v_anchor) % v_interval)) % v_interval);
      end if;

    elsif v_freq = 'weekly' then
      -- next matching ISO weekday on/after today, then align to interval weeks
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

    -- Remind only when the occurrence is imminent (cron runs daily at 23:00 UTC,
    -- so current_date + 1 is "today" in CET/CEST when the user wakes up).
    if v_target_date > current_date + 1 then
      continue;
    end if;

    -- One reminder per template per occurrence date.
    if exists (
      select 1 from notifications n
      where n.user_id = rec.user_id
        and n.type    = 'transaction_reminder'
        and n.data ->> 'templateId' = rec.id::text
        and n.data ->> 'date'       = v_target_date::text
    ) then
      continue;
    end if;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_reminder',
      case
        when v_target_date = current_date then 'Transakcja na dziś'
        else                                   'Transakcja na jutro'
      end,
      rec.description || ' — ' || to_char(rec.amount, 'FM999G990D00') || ' ' || rec.currency,
      jsonb_build_object(
        'transactionId', rec.id,
        'templateId',    rec.id,
        'amount',        rec.amount,
        'description',   rec.description,
        'date',          v_target_date,
        'isDueToday',    (v_target_date = current_date)
      )
    );
  end loop;
end;
$$;

comment on function public.process_recurring_transactions() is
  'Daily cron: sends transaction_reminder notifications for recurring templates whose next occurrence is today/tomorrow. Does NOT create transaction rows (reminder-only since 20260703).';
