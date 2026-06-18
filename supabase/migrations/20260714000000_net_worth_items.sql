-- Free, user-named net-worth asset items (replaces the fixed Inwestycje /
-- Nieruchomość slots on financial_snapshots). Each item carries its own currency;
-- conversion to PLN happens client-side via the NBP FX rate. Cash stays derived
-- from cash_positions; financial_snapshots keeps only the assets "as of" date.

create table public.net_worth_items (
  id          uuid           primary key default gen_random_uuid(),
  user_id     uuid           not null references auth.users(id) on delete cascade,
  label       text           not null check (char_length(label) between 1 and 60),
  amount      numeric(14, 2) not null default 0 check (amount >= 0),
  currency    text           not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  position    integer        not null default 0,
  created_at  timestamptz    not null default now(),
  updated_at  timestamptz    not null default now()
);

comment on table public.net_worth_items is
  'Owner-entered net-worth asset items (label + amount + currency). Not derived from bank import.';

create index net_worth_items_user_idx on public.net_worth_items(user_id);

create trigger set_updated_at
  before update on public.net_worth_items
  for each row execute function public.handle_updated_at();

alter table public.net_worth_items enable row level security;

create policy "net_worth_items: read own"
  on public.net_worth_items for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "net_worth_items: insert own"
  on public.net_worth_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "net_worth_items: update own"
  on public.net_worth_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "net_worth_items: delete own"
  on public.net_worth_items for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.net_worth_items to authenticated;

-- Backfill: move any existing fixed snapshot amounts into named items.
insert into public.net_worth_items (user_id, label, amount, currency, position)
select user_id, 'Inwestycje', investments_amount, 'PLN', 0
from public.financial_snapshots
where investments_amount > 0;

insert into public.net_worth_items (user_id, label, amount, currency, position)
select user_id, 'Nieruchomość', real_estate_amount, 'PLN', 1
from public.financial_snapshots
where real_estate_amount > 0;
