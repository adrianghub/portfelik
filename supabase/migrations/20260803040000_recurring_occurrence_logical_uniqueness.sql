-- P0-2B: one logical occurrence per (recurring_template_id, recurring_occurrence_date).
-- Replaces per-actor uniqueness so group members cannot materialize duplicate slots.

-- ---------------------------------------------------------------------------
-- 1. Dedup existing rows (inventory → survivor → repoint refs → delete losers)
-- ---------------------------------------------------------------------------
do $$
declare
  v_loser record;
begin
  for v_loser in
    with ranked as (
      select
        t.id,
        t.recurring_template_id,
        t.recurring_occurrence_date,
        row_number() over (
          partition by t.recurring_template_id, t.recurring_occurrence_date
          order by
            case t.status
              when 'paid' then 0
              when 'overdue' then 1
              when 'upcoming' then 2
              when 'draft' then 3
              else 4
            end,
            exists (
              select 1
              from public.plan_transaction_links ptl
              where ptl.transaction_id = t.id
            ) desc,
            case when t.user_id = tmpl.user_id then 0 else 1 end,
            t.created_at asc,
            t.id asc
        ) as rn
      from public.transactions t
      join public.transactions tmpl on tmpl.id = t.recurring_template_id
      where t.recurring_template_id is not null
        and t.recurring_occurrence_date is not null
    ),
    dup_losers as (
      select loser.id as loser_id, survivor.id as survivor_id
      from ranked loser
      join ranked survivor
        on survivor.recurring_template_id = loser.recurring_template_id
       and survivor.recurring_occurrence_date = loser.recurring_occurrence_date
       and survivor.rn = 1
      where loser.rn > 1
    )
    select loser_id, survivor_id from dup_losers
  loop
    update public.recurring_occurrence_skips s
    set skipped_transaction_id = v_loser.survivor_id
    where s.skipped_transaction_id = v_loser.loser_id;

    delete from public.plan_transaction_links ptl
    where ptl.transaction_id = v_loser.loser_id
      and exists (
        select 1
        from public.plan_transaction_links existing
        where existing.transaction_id = v_loser.survivor_id
          and existing.plan_id = ptl.plan_id
      );

    update public.plan_transaction_links ptl
    set transaction_id = v_loser.survivor_id
    where ptl.transaction_id = v_loser.loser_id;

    update public.transaction_import_links til
    set transaction_id = v_loser.survivor_id
    where til.transaction_id = v_loser.loser_id
      and not exists (
        select 1
        from public.transaction_import_links existing
        where existing.transaction_id = v_loser.survivor_id
      );

    delete from public.transaction_import_links til
    where til.transaction_id = v_loser.loser_id;

    update public.notifications n
    set data = jsonb_set(n.data, '{transactionId}', to_jsonb(v_loser.survivor_id::text), false)
    where n.data ->> 'transactionId' = v_loser.loser_id::text;

    delete from public.transactions t
    where t.id = v_loser.loser_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Replace uniqueness index with a named constraint (PostgREST upsert-compatible)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_transactions_recurring_occurrence_unique;

alter table public.transactions
  drop constraint if exists transactions_recurring_occurrence_logical_unique;

alter table public.transactions
  add constraint transactions_recurring_slot_pairing_check
  check (
    (recurring_template_id is null and recurring_occurrence_date is null)
    or (recurring_template_id is not null and recurring_occurrence_date is not null)
  );

alter table public.transactions
  add constraint transactions_recurring_occurrence_logical_unique
  unique (recurring_template_id, recurring_occurrence_date);

comment on constraint transactions_recurring_occurrence_logical_unique on public.transactions is
  'One materialized row per template recurrence slot, independent of which member materialized it.';

-- ---------------------------------------------------------------------------
-- 3. Cron materialization uses logical conflict target
-- ---------------------------------------------------------------------------
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
  end loop;
end;
$$;
