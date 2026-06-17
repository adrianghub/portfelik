-- 20260712000000_cash_positions.sql
-- One derived cash-position anchor per scope. Holds the opening balance + as-of date;
-- the live balance is computed in app code (opening + Σ paid income − Σ paid expense for
-- transactions on/after as_of_date). No per-bank accounts. See
-- docs/superpowers/specs/2026-06-17-derived-cash-position-design.md.

create table public.cash_positions (
  id             uuid        primary key default gen_random_uuid(),
  owner_id       uuid        references auth.users(id) on delete cascade,
  group_id       uuid        references public.user_groups(id) on delete cascade,
  opening_amount numeric(12,2) not null default 0,
  as_of_date     date        not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cash_positions_one_scope check (
    (owner_id is not null and group_id is null)
    or (owner_id is null and group_id is not null)
  )
);

comment on table public.cash_positions is
  'Opening balance + as-of date anchoring a single derived cash position per scope (private owner_id or group_id). Live balance is computed in app code from paid transactions; never stored here.';

-- Plain (non-partial) unique indexes: one row per scope. NULL scope keys stay
-- multi-allowed (default NULLS DISTINCT), so a private row's NULL group_id and a
-- group row's NULL owner_id never collide; the cash_positions_one_scope CHECK still
-- guarantees exactly one scope is set. Plain (not partial) so they are valid
-- ON CONFLICT arbiters for the owner_id upsert in upsertPrivateCashPosition.
create unique index cash_positions_owner_uniq on public.cash_positions(owner_id);
create unique index cash_positions_group_uniq on public.cash_positions(group_id);

alter table public.cash_positions enable row level security;

create policy "cash_positions: select own or group member"
  on public.cash_positions for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_member(group_id)))
  );

create policy "cash_positions: insert own or group co-owner"
  on public.cash_positions for insert
  to authenticated
  with check (
    (owner_id = (select auth.uid()) and group_id is null)
    or (owner_id is null and group_id is not null and (select public.is_group_co_owner(group_id)))
  );

create policy "cash_positions: update own or group co-owner"
  on public.cash_positions for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_co_owner(group_id)))
  )
  with check (
    owner_id = (select auth.uid())
    or (group_id is not null and (select public.is_group_co_owner(group_id)))
  );

revoke all on table public.cash_positions from public;
revoke all on table public.cash_positions from anon;
grant select, insert, update on table public.cash_positions to authenticated;

create trigger set_updated_at
  before update on public.cash_positions
  for each row execute function public.handle_updated_at();

insert into public.cash_positions (owner_id, opening_amount, as_of_date)
select fs.user_id, greatest(coalesce(fs.cash_amount, 0), 0), fs.as_of_date
from public.financial_snapshots fs
on conflict do nothing;
