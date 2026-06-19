-- Surface still-unsettled card holds in the ledger (issue: import card holds).
-- is_hold is true only while a kept hold is unsettled; the fold clears the
-- link's is_hold on settle, so the badge self-clears.
create or replace view public.transactions_with_category
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
