-- Calendar-style recurrence end: optional stop date for a recurring template.
-- NULL = open-ended (prior behavior). Meaningful only on template rows
-- (is_recurring = true); ignored on occurrence rows.
alter table public.transactions
  add column if not exists recurrence_end_date date;

comment on column public.transactions.recurrence_end_date is
  'Optional inclusive last date a recurring template generates occurrences. NULL = open-ended. Template-only.';

-- DROP + recreate required: CREATE OR REPLACE VIEW cannot reorder columns,
-- and the new base-table column shifts t.* positions.
drop view if exists public.transactions_with_category;

create view public.transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type,
    coalesce(l.is_hold, false) as is_hold
  from public.transactions t
  join public.categories c on c.id = t.category_id
  left join public.transaction_import_links l on l.transaction_id = t.id;

comment on view public.transactions_with_category is
  'Transactions joined with category name/type and hold flag. SECURITY INVOKER - caller RLS applies.';

grant select on table public.transactions_with_category to authenticated, anon, service_role;
