-- Recurring transactions: full frequency engine.
--
-- Previously recurrence was day-of-month only (`recurring_day`) and the cron ran
-- monthly. This adds a frequency model (daily / weekly / monthly / yearly) with
-- an interval ("every N units"), a weekday (weekly) and a month (yearly), keeps
-- `recurring_day` for monthly/yearly day-of-month, backfills existing rows as
-- monthly, and rewrites the scheduler to compute the next occurrence per rule.
-- The cron is moved from monthly to daily so daily/weekly rules fire.

-- ── 1. Frequency enum ────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'recurrence_frequency') then
    create type recurrence_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');
  end if;
end $$;

-- ── 2. New columns (nullable; weekday is ISO 1=Mon..7=Sun) ───────────────────
alter table transactions
  add column if not exists recurrence_frequency recurrence_frequency,
  add column if not exists recurrence_interval  smallint not null default 1,
  add column if not exists recurrence_weekday   smallint,
  add column if not exists recurrence_month     smallint;

comment on column transactions.recurrence_frequency is 'daily | weekly | monthly | yearly. Set when is_recurring.';
comment on column transactions.recurrence_interval  is 'Every N units of the frequency (>= 1).';
comment on column transactions.recurrence_weekday   is 'Weekly rules: ISO weekday 1=Mon..7=Sun.';
comment on column transactions.recurrence_month     is 'Yearly rules: month 1..12 (paired with recurring_day).';

-- ── 3. Backfill existing recurring rows as monthly ───────────────────────────
update transactions
set recurrence_frequency = 'monthly',
    recurrence_interval  = 1
where is_recurring = true
  and recurrence_frequency is null;

-- ── 4. Swap the day-of-month-only constraint for the frequency model ─────────
alter table transactions drop constraint if exists recurring_day_required;

alter table transactions
  add constraint recurrence_fields_valid check (
    not is_recurring or (
      recurrence_frequency is not null
      and recurrence_interval >= 1
      and (recurrence_weekday is null or recurrence_weekday between 1 and 7)
      and (recurring_day is null or recurring_day between 1 and 31)
      and (recurrence_month is null or recurrence_month between 1 and 12)
      and (recurrence_frequency <> 'weekly' or recurrence_weekday is not null)
      and (recurrence_frequency not in ('monthly', 'yearly') or recurring_day is not null)
      and (recurrence_frequency <> 'yearly' or recurrence_month is not null)
    )
  );

-- ── 5. Rewrite the scheduler: next occurrence per rule ───────────────────────
create or replace function process_recurring_transactions()
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
  v_inserted_id uuid;
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

    -- Dedupe: one upcoming row per template identity per exact target date.
    if exists (
      select 1 from transactions t
      where t.user_id     = rec.user_id
        and t.description = rec.description
        and t.amount      = rec.amount
        and t.category_id = rec.category_id
        and t.status      = 'upcoming'
        and t.date::date  = v_target_date
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
      rec.description || ' - ' || to_char(rec.amount, 'FM999G990D00') || ' ' || rec.currency,
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

-- ── 6. Run daily (was monthly) so daily/weekly rules fire ────────────────────
select cron.schedule(
  'process-recurring-transactions',
  '0 23 * * *',                                  -- 23:00 UTC daily
  $$ select public.process_recurring_transactions(); $$
);
