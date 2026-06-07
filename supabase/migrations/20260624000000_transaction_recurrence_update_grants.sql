-- Fix 42501 on transaction edit: recurrence columns (20260606000000) were never added
-- to the column-level UPDATE grant list from 20260517000000 (shopping_list_id removed in
-- 20260617000000). Reconcile the full client-editable column set.

grant update (
  amount,
  currency,
  description,
  date,
  type,
  status,
  category_id,
  is_recurring,
  recurring_day,
  recurring_template_id,
  recurrence_frequency,
  recurrence_interval,
  recurrence_weekday,
  recurrence_month,
  group_id,
  updated_at
) on table public.transactions to authenticated;

comment on table public.transactions is
  'Core ledger. Client UPDATE is column-scoped (user_id immutable). Includes recurrence_* since 20260624.';
