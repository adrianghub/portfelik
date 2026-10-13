-- Distinguish a historical start-of-day anchor from a confirmed end-of-day balance.
-- Existing rows keep start_of_day, so live balances do not move on deploy.
-- New confirmations write end_of_day: opening_amount already includes booked
-- movements on as_of_date. save_net_worth_snapshot still omits this column, so
-- an insert takes the default and an update leaves a stored value in place.

alter table public.cash_positions
  add column balance_semantics text not null default 'start_of_day';

alter table public.cash_positions
  add constraint cash_positions_balance_semantics_check
  check (balance_semantics in ('start_of_day', 'end_of_day'));

comment on column public.cash_positions.balance_semantics is
  'start_of_day: opening_amount is the balance before transactions on as_of_date. end_of_day: opening_amount already includes booked transactions on as_of_date.';
