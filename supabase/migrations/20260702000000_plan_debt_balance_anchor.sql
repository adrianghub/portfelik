-- Debt plan balance snapshot: mid-loan users anchor manual balance + date;
-- only linked payments after balance_anchor_date reduce current_balance in replay.

alter table public.plan_debt_terms
  add column if not exists anchor_balance numeric(12, 2)
    check (anchor_balance is null or anchor_balance >= 0),
  add column if not exists balance_anchor_date date;

comment on column public.plan_debt_terms.anchor_balance is
  'Frozen principal snapshot at balance_anchor_date; replay start in snapshot mode.';
comment on column public.plan_debt_terms.balance_anchor_date is
  'Only linked payments strictly after this date affect balance replay in snapshot mode.';

-- Backfill: preserve today''s manual / synced balances as snapshot anchors.
update public.plan_debt_terms
set
  anchor_balance = current_balance,
  balance_anchor_date = (updated_at at time zone 'UTC')::date
where anchor_balance is null or balance_anchor_date is null;

grant update (anchor_balance, balance_anchor_date) on table public.plan_debt_terms to authenticated;
