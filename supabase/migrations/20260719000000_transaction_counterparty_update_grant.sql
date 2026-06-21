-- Fix 42501 "permission denied for table transactions" on edit.
--
-- 20260517000000 stripped table-level UPDATE from authenticated and re-granted
-- per editable column (user_id stays immutable). Every column added since must
-- be re-added to that grant list or client UPDATEs that touch it 403. The
-- recurrence_* columns hit this in 20260624000000; `counterparty` (added in
-- 20260626000000) was missed the same way, so editing any transaction whose
-- form submits a counterparty value fails.
--
-- Re-grant the full current client-editable column set (idempotent). user_id,
-- id, created_at stay excluded. recurring_template_id was dropped (20260705000000)
-- so it is intentionally absent.

grant update (
  amount,
  currency,
  description,
  date,
  type,
  status,
  category_id,
  counterparty,
  is_recurring,
  recurring_day,
  recurrence_frequency,
  recurrence_interval,
  recurrence_weekday,
  recurrence_month,
  group_id,
  updated_at
) on table public.transactions to authenticated;

comment on table public.transactions is
  'Core ledger. Client UPDATE is column-scoped (user_id immutable). Includes counterparty since 20260718.';
