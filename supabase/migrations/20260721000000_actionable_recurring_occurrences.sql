-- Recurring transactions: actionable near-term occurrences.
--
-- 20260703 deliberately stopped writing phantom rows because generated
-- instances had no durable source/slot metadata and could reappear as overdue
-- noise. We now restore materialization only with explicit provenance:
--   * recurring_template_id points to the source recurring transaction.
--   * recurring_occurrence_date keeps the original recurrence slot even if the
--     user edits the actual row date.
--   * recurring_occurrence_skips records one-off deletes/skips so sync does
--     not recreate a row the user intentionally removed.

drop view if exists public.transactions_with_category;

alter table public.transactions
  add column if not exists recurring_template_id uuid
    references public.transactions(id) on delete set null,
  add column if not exists recurring_occurrence_date date;

comment on column public.transactions.recurring_template_id is
  'Source recurring transaction for generated near-term occurrences. Null for normal/manual rows and templates.';
comment on column public.transactions.recurring_occurrence_date is
  'Original recurrence slot for generated occurrences; stable even if the transaction date is edited.';

create index if not exists idx_transactions_recurring_template_id
  on public.transactions (recurring_template_id)
  where recurring_template_id is not null;

create unique index if not exists idx_transactions_recurring_occurrence_unique
  on public.transactions (user_id, recurring_template_id, recurring_occurrence_date)
  nulls distinct;

create table if not exists public.recurring_occurrence_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.user_groups(id) on delete cascade,
  recurring_template_id uuid not null references public.transactions(id) on delete cascade,
  occurrence_date date not null,
  skipped_transaction_id uuid references public.transactions(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (recurring_template_id, occurrence_date)
);

comment on table public.recurring_occurrence_skips is
  'One-off skip/delete memory for generated recurring occurrences. Prevents sync from recreating intentionally skipped slots.';

alter table public.recurring_occurrence_skips enable row level security;

create policy "recurring skips: select own or group"
  on public.recurring_occurrence_skips for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_member(group_id)))
  );

create policy "recurring skips: insert own or co-owner"
  on public.recurring_occurrence_skips for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      user_id = (select auth.uid())
      or (group_id is not null and (select public.is_group_co_owner(group_id)))
    )
  );

create index if not exists idx_recurring_occurrence_skips_scope
  on public.recurring_occurrence_skips (user_id, occurrence_date);

create or replace view public.transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type,
    coalesce(l.is_hold, false) as is_hold
  from public.transactions t
  join public.categories c on c.id = t.category_id
  left join public.transaction_import_links l on l.transaction_id = t.id;

comment on view public.transactions_with_category is
  'Transactions joined with category name/type and hold flag. SECURITY INVOKER - caller RLS applies.';

grant select on table public.transactions_with_category to authenticated, anon, service_role;
grant select, insert on table public.recurring_occurrence_skips to authenticated;

revoke update on table public.transactions from authenticated;
grant update (
  amount,
  currency,
  description,
  counterparty,
  date,
  type,
  status,
  category_id,
  is_recurring,
  recurring_day,
  recurrence_frequency,
  recurrence_interval,
  recurrence_weekday,
  recurrence_month,
  recurring_template_id,
  recurring_occurrence_date,
  group_id,
  updated_at
) on table public.transactions to authenticated;
