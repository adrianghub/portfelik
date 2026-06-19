-- Card holds (blokady) surfaced in import review (issue: import card holds).
-- A held row is parsed from the ING 'Kwota blokady/zwolnienie blokady' column
-- and defaults to decision='pending' so the commit RPC blocks until the user
-- keeps or drops it. The flag rides preview -> commit so the committed link
-- can be marked as a hold (migration 20260714000000).
alter table public.transaction_import_rows
  add column if not exists is_hold boolean not null default false;
