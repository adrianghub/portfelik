-- P0-3A: category type ↔ transaction type invariants.
-- 1) Backfill mismatched ledger rows to the owner's Inne of the transaction type.
-- 2) BEFORE INSERT/UPDATE trigger on transactions.
-- 3) BEFORE UPDATE OF type on categories when any transaction/rule references it.

-- ---------------------------------------------------------------------------
-- 1. Audit + backfill mismatched (transaction.type, category.type) pairs
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_fallback uuid;
  v_fallback_name text;
begin
  for r in
    select t.id as tx_id, t.user_id, t.type as tx_type, c.id as cat_id, c.type as cat_type
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.type <> c.type
  loop
    perform public.seed_default_categories(r.user_id);
    v_fallback_name := case
      when r.tx_type = 'expense' then 'Inne wydatki'
      else 'Inne przychody'
    end;

    select c.id into v_fallback
    from public.categories c
    where c.user_id = r.user_id
      and c.type = r.tx_type
      and c.name = v_fallback_name
    order by c.created_at
    limit 1;

    if v_fallback is null then
      insert into public.categories (name, type, user_id)
      values (v_fallback_name, r.tx_type, r.user_id)
      returning id into v_fallback;
    end if;

    update public.transactions
    set category_id = v_fallback, updated_at = now()
    where id = r.tx_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Enforce category.type = transaction.type on write
-- ---------------------------------------------------------------------------
create or replace function public.enforce_transaction_category_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat_type public.transaction_type;
begin
  if new.category_id is null then
    return new;
  end if;

  select c.type into v_cat_type
  from public.categories c
  where c.id = new.category_id;

  if v_cat_type is null then
    raise exception 'category_not_found' using errcode = 'P0001';
  end if;

  if v_cat_type <> new.type then
    raise exception 'category_type_mismatch' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Fire after plan-link type lock (alphabetically later than lock_linked_transaction_type).
drop trigger if exists enforce_transaction_category_type on public.transactions;
drop trigger if exists tx_enforce_transaction_category_type on public.transactions;
create trigger tx_enforce_transaction_category_type
  before insert or update of category_id, type
  on public.transactions
  for each row
  execute function public.enforce_transaction_category_type();

comment on function public.enforce_transaction_category_type() is
  'Rejects transaction writes where categories.type does not match transactions.type. SECURITY DEFINER so category type is readable under RLS.';

-- ---------------------------------------------------------------------------
-- 3. Block category type flips while referenced
-- ---------------------------------------------------------------------------
create or replace function public.prevent_referenced_category_type_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.type is not distinct from new.type then
    return new;
  end if;

  if exists (select 1 from public.transactions t where t.category_id = new.id)
     or exists (select 1 from public.categorization_rules r where r.category_id = new.id)
  then
    raise exception 'category_type_in_use' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_referenced_category_type_change on public.categories;
create trigger prevent_referenced_category_type_change
  before update of type
  on public.categories
  for each row
  execute function public.prevent_referenced_category_type_change();

comment on function public.prevent_referenced_category_type_change() is
  'Rejects category type changes while any transaction or categorization rule references the category.';
