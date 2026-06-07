-- Manual holdings snapshot for net-worth hero on Plany (D1).
-- One current row per user; assets are user-entered, debt aggregates from debt plans client-side.

create table public.financial_snapshots (
  user_id             uuid            primary key references auth.users(id) on delete cascade,
  as_of_date          date            not null default current_date,
  cash_amount         numeric(12, 2)  not null default 0 check (cash_amount >= 0),
  investments_amount  numeric(12, 2)  not null default 0 check (investments_amount >= 0),
  real_estate_amount  numeric(12, 2)  not null default 0 check (real_estate_amount >= 0),
  created_at          timestamptz     not null default now(),
  updated_at          timestamptz     not null default now()
);

comment on table public.financial_snapshots is
  'Owner-entered asset snapshot for net-worth display. Not derived from bank import.';

create trigger set_updated_at
  before update on public.financial_snapshots
  for each row execute function public.handle_updated_at();

alter table public.financial_snapshots enable row level security;

create policy "financial_snapshots: read own"
  on public.financial_snapshots for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "financial_snapshots: insert own"
  on public.financial_snapshots for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "financial_snapshots: update own"
  on public.financial_snapshots for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "financial_snapshots: delete own"
  on public.financial_snapshots for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.financial_snapshots to authenticated;

grant update (
  as_of_date,
  cash_amount,
  investments_amount,
  real_estate_amount,
  updated_at
) on table public.financial_snapshots to authenticated;
