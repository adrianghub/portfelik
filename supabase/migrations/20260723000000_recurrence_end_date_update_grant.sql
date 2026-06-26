-- recurrence_end_date was added after the transactions column-level UPDATE
-- allow-list. Keep authenticated users able to change only this template field;
-- existing RLS policies continue to decide which transaction rows they may edit.
grant update (recurrence_end_date) on table public.transactions to authenticated;
