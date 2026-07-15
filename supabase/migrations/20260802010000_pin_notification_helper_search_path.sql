-- These immutable formatters use only built-in pg_catalog functions. Pinning
-- their lookup path prevents callers from shadowing referenced functions.
alter function public.notification_tx_title(text, numeric, character)
  set search_path = pg_catalog;

alter function public.notification_tx_body_due_today()
  set search_path = pg_catalog;

alter function public.notification_tx_body_overdue(date)
  set search_path = pg_catalog;
