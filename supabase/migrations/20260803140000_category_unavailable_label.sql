-- Represent RLS-hidden private categories as an unavailable sentinel, not a
-- fabricated fallback category name ("Inna kategoria" looked like a real Inne row).

drop view if exists public.transactions_with_category;

create view public.transactions_with_category
  with (security_invoker = true)
as
select
  t.*,
  coalesce(c.name, 'Kategoria niedostępna') as category_name,
  coalesce(c.type, t.type) as category_type,
  coalesce(l.is_hold, false) as is_hold
from public.transactions t
left join public.categories c on c.id = t.category_id
left join public.transaction_import_links l on l.transaction_id = t.id;

comment on view public.transactions_with_category is
  'Transactions enriched with caller-visible category data and import hold state. Private categories fall back to "Kategoria niedostępna" without hiding shared transactions.';

grant select on public.transactions_with_category to authenticated, anon, service_role;
