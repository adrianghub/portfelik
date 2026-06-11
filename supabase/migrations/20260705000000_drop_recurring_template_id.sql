-- Drop orphaned transactions.recurring_template_id.
--
-- Added in 20260426 so generated recurring instances could reference their
-- source template for exact dedupe. The 20260606 scheduler rewrite stopped
-- writing it (content-based dedupe), and 20260703 removed instance
-- materialization entirely — recurrence is reminder-only now, so no code path
-- reads or writes this column or its partial index.
--
-- transactions_with_category selects t.*, so it must be recreated around the
-- column drop (same definition as 20260628, minus the dropped column).

drop index if exists public.idx_transactions_recurring_template;

drop view if exists public.transactions_with_category;

alter table public.transactions
  drop column if exists recurring_template_id;

create view public.transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type
  from public.transactions t
  join public.categories c on c.id = t.category_id;

comment on view public.transactions_with_category is
  'Transactions joined with category name and type. SECURITY INVOKER - caller RLS applies.';

grant select on table public.transactions_with_category to authenticated, anon, service_role;
