-- Refresh transactions_with_category so t.* picks up transactions.counterparty.
drop view if exists public.transactions_with_category;

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
