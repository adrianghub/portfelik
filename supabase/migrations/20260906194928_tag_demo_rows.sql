-- Demo rows need durable ownership metadata. Human-facing labels stay natural,
-- while cleanup remains complete and scoped to the authenticated user.

alter table public.transactions
  add column is_demo boolean not null default false;

alter table public.plans
  add column is_demo boolean not null default false;

alter table public.net_worth_items
  add column is_demo boolean not null default false;

comment on column public.transactions.is_demo is
  'True only for disposable rows created by the in-product showcase.';
comment on column public.plans.is_demo is
  'True only for disposable rows created by the in-product showcase.';
comment on column public.net_worth_items.is_demo is
  'True only for disposable rows created by the in-product showcase.';

-- The view was created from t.* before is_demo existed. Recreate it so exports
-- and every transaction read carry the ownership marker too.
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
  'Transactions enriched with caller-visible category data, import hold state, and demo ownership. Private categories fall back to "Kategoria niedostępna" without hiding shared transactions.';

grant select on public.transactions_with_category to authenticated, anon, service_role;

-- Keep cleanup compatible with showcase data created before this migration.
update public.transactions set is_demo = true where description like 'Demo:%';
update public.plans set is_demo = true where name like 'Demo:%';
update public.net_worth_items set is_demo = true where label like 'Demo:%';

create index transactions_demo_owner_idx
  on public.transactions (user_id)
  where is_demo;
create index plans_demo_owner_idx
  on public.plans (user_id)
  where is_demo;
create index net_worth_items_demo_owner_idx
  on public.net_worth_items (user_id)
  where is_demo;

create or replace function public.clear_demo_data()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plans int := 0;
  v_txs int := 0;
  v_items int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Plans first so debt terms and settlement links disappear through their FKs.
  with deleted as (
    delete from public.plans
    where user_id = v_uid
      and (is_demo or name like 'Demo:%')
    returning id
  )
  select count(*)::int into v_plans from deleted;

  with deleted as (
    delete from public.transactions
    where user_id = v_uid
      and (is_demo or description like 'Demo:%')
    returning id
  )
  select count(*)::int into v_txs from deleted;

  with deleted as (
    delete from public.net_worth_items
    where user_id = v_uid
      and (is_demo or label like 'Demo:%')
    returning id
  )
  select count(*)::int into v_items from deleted;

  return jsonb_build_object(
    'plans', v_plans,
    'transactions', v_txs,
    'net_worth_items', v_items,
    'deleted', v_plans + v_txs + v_items
  );
end;
$$;

comment on function public.clear_demo_data() is
  'Atomically deletes every tagged showcase row owned by the caller; legacy Demo: labels remain supported.';

revoke all on function public.clear_demo_data() from public, anon;
grant execute on function public.clear_demo_data() to authenticated;
