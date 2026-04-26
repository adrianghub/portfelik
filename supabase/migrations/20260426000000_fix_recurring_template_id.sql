-- =============================================================================
-- Fix: recurring transaction dedup collision on identical templates
--
-- Previous dedup checked (user_id, description, amount, category_id, month).
-- Two recurring templates with identical content (e.g., two subscriptions at
-- the same price) would both match the same existing row — second template
-- silently skipped every run.
--
-- Fix: add recurring_template_id so each instance references its source
-- template. Dedup is now (user_id, recurring_template_id, month) — exact
-- and collision-free regardless of content.
-- =============================================================================

alter table transactions
  add column recurring_template_id uuid references transactions(id) on delete set null;

create index idx_transactions_recurring_template
  on transactions (user_id, recurring_template_id)
  where recurring_template_id is not null;


create or replace function process_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec           record;
  v_target_date date;
  v_inserted_id uuid;
begin
  for rec in
    select id, user_id, amount, currency, description, type,
           category_id, recurring_day
    from transactions
    where is_recurring = true
  loop
    v_target_date := make_date(
      extract(year  from now())::int,
      extract(month from now())::int,
      least(rec.recurring_day, extract(day from
        (date_trunc('month', now()) + interval '1 month - 1 day')::date)::int)
    );

    if v_target_date < current_date then
      v_target_date := (v_target_date + interval '1 month')::date;
    end if;

    -- one instance per template per month — no content-based false positives
    if exists (
      select 1 from transactions t
      where t.user_id               = rec.user_id
        and t.recurring_template_id = rec.id
        and t.status                = 'upcoming'
        and t.date >= date_trunc('month', v_target_date)
        and t.date <  date_trunc('month', v_target_date) + interval '1 month'
    ) then
      continue;
    end if;

    insert into transactions (
      amount, currency, description, date, type, status,
      category_id, user_id, is_recurring, recurring_day, recurring_template_id
    )
    values (
      rec.amount, rec.currency, rec.description, v_target_date, rec.type,
      'upcoming', rec.category_id, rec.user_id, false, null, rec.id
    )
    returning id into v_inserted_id;

    insert into notifications (user_id, type, title, body, data)
    values (
      rec.user_id,
      'transaction_upcoming',
      'Nadchodząca transakcja',
      rec.description || ' — ' || to_char(rec.amount, 'FM999G990D00') || ' ' || rec.currency,
      jsonb_build_object(
        'transactionId',        v_inserted_id,
        'recurringTemplateId',  rec.id,
        'amount',               rec.amount,
        'description',          rec.description,
        'date',                 v_target_date
      )
    );
  end loop;
end;
$$;
