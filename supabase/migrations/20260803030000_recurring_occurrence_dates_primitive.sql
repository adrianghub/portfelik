-- P0-2A: canonical recurrence date primitive shared by cron and client projector.

create or replace function public.recurring_last_dom(p_year int, p_month int)
returns int
language sql
immutable
as $$
  select extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int;
$$;

create or replace function public.recurring_clamp_dom(p_year int, p_month int, p_day int)
returns int
language sql
immutable
as $$
  select least(p_day, public.recurring_last_dom(p_year, p_month));
$$;

create or replace function public.recurring_occurrence_dates(
  p_anchor_date date,
  p_frequency recurrence_frequency,
  p_interval int default 1,
  p_weekday int default null,
  p_month int default null,
  p_day int default null,
  p_after_exclusive date default null,
  p_before_exclusive date default null,
  p_end_date_inclusive date default null,
  p_max_count int default 400
)
returns date[]
language plpgsql
immutable
as $$
declare
  v_interval int := greatest(coalesce(p_interval, 1), 1);
  v_cursor date;
  v_anchor date := p_anchor_date;
  v_after date := coalesce(p_after_exclusive, '0001-01-01'::date);
  v_before date := coalesce(p_before_exclusive, '9999-12-31'::date);
  v_day int;
  v_month int;
  v_year int;
  v_target_dow int;
  v_anchor_dow int;
  v_delta int;
  v_gap_days int;
  v_gap_weeks int;
  v_out date[] := '{}';
  v_guard int;
begin
  if p_frequency is null or p_anchor_date is null then
    return v_out;
  end if;

  if p_frequency = 'daily' then
    v_cursor := v_anchor;
  elsif p_frequency = 'weekly' then
    v_target_dow := coalesce(p_weekday, extract(isodow from v_anchor)::int);
    v_anchor_dow := extract(isodow from v_anchor)::int;
    v_delta := (v_target_dow - v_anchor_dow + 7) % 7;
    v_cursor := v_anchor + v_delta;
  elsif p_frequency = 'monthly' then
    v_day := coalesce(p_day, extract(day from v_anchor)::int);
    v_year := extract(year from v_anchor)::int;
    v_month := extract(month from v_anchor)::int;
    v_cursor := make_date(v_year, v_month, public.recurring_clamp_dom(v_year, v_month, v_day));
  else
    v_day := coalesce(p_day, extract(day from v_anchor)::int);
    v_month := coalesce(p_month, extract(month from v_anchor)::int);
    v_year := extract(year from v_anchor)::int;
    v_cursor := make_date(v_year, v_month, public.recurring_clamp_dom(v_year, v_month, v_day));
  end if;

  if v_cursor <= v_after then
    if p_frequency = 'daily' then
      v_gap_days := ceil((v_after - v_cursor + 1)::numeric / v_interval::numeric)::int;
      v_cursor := v_cursor + (v_gap_days * v_interval);
      while v_cursor <= v_after loop
        v_cursor := v_cursor + v_interval;
      end loop;
    elsif p_frequency = 'weekly' then
      v_gap_weeks := ceil((v_after - v_cursor + 1)::numeric / (7 * v_interval)::numeric)::int;
      v_cursor := v_cursor + (v_gap_weeks * 7 * v_interval);
      while v_cursor <= v_after loop
        v_cursor := v_cursor + (7 * v_interval);
      end loop;
    else
      v_guard := 0;
      while v_cursor <= v_after and v_guard < 5000 loop
        v_guard := v_guard + 1;
        if p_frequency = 'monthly' then
          v_day := coalesce(p_day, extract(day from v_anchor)::int);
          v_month := extract(month from v_cursor)::int + v_interval;
          v_year := extract(year from v_cursor)::int + ((v_month - 1) / 12);
          v_month := ((v_month - 1) % 12) + 1;
          v_cursor := make_date(v_year, v_month, public.recurring_clamp_dom(v_year, v_month, v_day));
        else
          v_day := coalesce(p_day, extract(day from v_anchor)::int);
          v_month := coalesce(p_month, extract(month from v_anchor)::int);
          v_year := extract(year from v_cursor)::int + v_interval;
          v_cursor := make_date(v_year, v_month, public.recurring_clamp_dom(v_year, v_month, v_day));
        end if;
      end loop;
    end if;
  end if;

  v_guard := 0;
  while v_cursor < v_before and v_guard < coalesce(p_max_count, 400) loop
    v_guard := v_guard + 1;
    if v_cursor > v_after
       and v_cursor >= v_anchor
       and (p_end_date_inclusive is null or v_cursor <= p_end_date_inclusive) then
      v_out := array_append(v_out, v_cursor);
    end if;

    if p_frequency = 'daily' then
      v_cursor := v_cursor + v_interval;
    elsif p_frequency = 'weekly' then
      v_cursor := v_cursor + (7 * v_interval);
    elsif p_frequency = 'monthly' then
      v_day := coalesce(p_day, extract(day from v_anchor)::int);
      v_month := extract(month from v_cursor)::int + v_interval;
      v_year := extract(year from v_cursor)::int + ((v_month - 1) / 12);
      v_month := ((v_month - 1) % 12) + 1;
      v_cursor := make_date(v_year, v_month, public.recurring_clamp_dom(v_year, v_month, v_day));
    else
      v_day := coalesce(p_day, extract(day from v_anchor)::int);
      v_month := coalesce(p_month, extract(month from v_anchor)::int);
      v_year := extract(year from v_cursor)::int + v_interval;
      v_cursor := make_date(v_year, v_month, public.recurring_clamp_dom(v_year, v_month, v_day));
    end if;
  end loop;

  return v_out;
end;
$$;

comment on function public.recurring_occurrence_dates(
  date, recurrence_frequency, int, int, int, int, date, date, date, int
) is
  'Canonical recurrence date list for one template. Bounds are exclusive; anchor is inclusive minimum; end date is inclusive maximum.';

create or replace function public.recurring_occurrence_on_date(
  p_anchor_date date,
  p_frequency recurrence_frequency,
  p_interval int default 1,
  p_weekday int default null,
  p_month int default null,
  p_day int default null,
  p_reference_date date default null,
  p_end_date_inclusive date default null
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_reference_date = any(
      public.recurring_occurrence_dates(
        p_anchor_date,
        p_frequency,
        p_interval,
        p_weekday,
        p_month,
        p_day,
        p_reference_date - 1,
        p_reference_date + 1,
        p_end_date_inclusive,
        1
      )
    ),
    false
  );
$$;

comment on function public.recurring_occurrence_on_date(
  date, recurrence_frequency, int, int, int, int, date, date
) is
  'True when reference_date is a generated occurrence for the template params.';

revoke all on function public.recurring_occurrence_dates(
  date, recurrence_frequency, int, int, int, int, date, date, date, int
) from public, anon;
revoke all on function public.recurring_occurrence_on_date(
  date, recurrence_frequency, int, int, int, int, date, date
) from public, anon;

grant execute on function public.recurring_occurrence_dates(
  date, recurrence_frequency, int, int, int, int, date, date, date, int
) to authenticated, service_role;
grant execute on function public.recurring_occurrence_on_date(
  date, recurrence_frequency, int, int, int, int, date, date
) to authenticated, service_role;

-- Cron: delegate due-day detection to the shared primitive and honor recurrence_end_date.
create or replace function public.process_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec               record;
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
    v_anchor := rec.date::date;

    if not public.recurring_occurrence_on_date(
      v_anchor,
      rec.recurrence_frequency,
      rec.recurrence_interval,
      rec.recurrence_weekday,
      rec.recurrence_month,
      rec.recurring_day,
      current_date,
      rec.recurrence_end_date
    ) then
      continue;
    end if;

    v_target_date := current_date;

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
