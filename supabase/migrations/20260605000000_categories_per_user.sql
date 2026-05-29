-- Make transaction categories per-user.
--
-- Previously default categories were global rows (user_id IS NULL) shared by
-- every user and read-only to non-admins. The product now treats defaults as a
-- starter set that each user fully owns and may rename or delete. This migration:
--   1. copies every global category into a per-user owned row (idempotent),
--   2. repoints persistent FK holders (transactions, shopping_lists,
--      categorization_rules) from the global row to the owner's copy,
--   3. fails non-destructively if any persistent FK still points at a global,
--   4. deletes the global rows (transient import-row FKs are `on delete set
--      null`, so they clear automatically),
--   5. drops the "system visible to all" + admin-system RLS policies,
--   6. installs a trigger that seeds the default set for every new user.
--
-- On a fresh local reset this is a structural no-op for the data steps (no
-- users/globals exist yet — seed.sql no longer creates globals); it matters on
-- prod/staging where globals and users already exist.

-- ── 1. Per-user copies of every global category ──────────────────────────────
-- Skip names a user already owns (their own category wins; repoint targets it).
insert into categories (name, type, user_id, created_at, updated_at)
select g.name, g.type, p.id, now(), now()
from categories g
cross join profiles p
where g.user_id is null
  and not exists (
    select 1 from categories c
    where c.user_id = p.id and c.name = g.name and c.type = g.type
  );

-- ── 2. Repoint persistent FK holders to each owner's copy ────────────────────
update transactions t
set category_id = uc.id
from categories g
join categories uc on uc.name = g.name and uc.type = g.type
where t.category_id = g.id
  and g.user_id is null
  and uc.user_id = t.user_id;

update shopping_lists s
set category_id = uc.id
from categories g
join categories uc on uc.name = g.name and uc.type = g.type
where s.category_id = g.id
  and g.user_id is null
  and uc.user_id = s.user_id;

update categorization_rules r
set category_id = uc.id
from categories g
join categories uc on uc.name = g.name and uc.type = g.type
where r.category_id = g.id
  and g.user_id is null
  and uc.user_id = r.user_id;

-- ── 3. Non-destructive guard: no persistent FK may still reference a global ──
do $$
begin
  if exists (
        select 1 from transactions t
        join categories g on g.id = t.category_id and g.user_id is null
      )
     or exists (
        select 1 from shopping_lists s
        join categories g on g.id = s.category_id and g.user_id is null
      )
     or exists (
        select 1 from categorization_rules r
        join categories g on g.id = r.category_id and g.user_id is null
      )
  then
    raise exception 'categories_per_user_migration_incomplete: a persistent FK still references a global category (likely an orphaned user_id). Resolve before deleting globals.';
  end if;
end $$;

-- ── 4. Delete the global rows (import-row FKs clear via on delete set null) ───
delete from categories where user_id is null;

-- ── 5. Drop system / admin RLS policies; keep own + group-shared reads ───────
drop policy if exists "categories: system categories visible to all authenticated" on categories;
drop policy if exists "categories: admins insert system" on categories;
drop policy if exists "categories: admins update system" on categories;
drop policy if exists "categories: admins delete system" on categories;

comment on table categories is 'Transaction categories. Always user-owned (user_id NOT NULL by convention); defaults seeded per user on signup.';

-- ── 6. Seed defaults for every new user ──────────────────────────────────────
create or replace function seed_default_categories(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into categories (name, type, user_id)
  select seed.name, seed.type::transaction_type, p_user_id
  from (
    values
      ('Jedzenie i zakupy', 'expense'),
      ('Transport', 'expense'),
      ('Mieszkanie', 'expense'),
      ('Rozrywka', 'expense'),
      ('Zdrowie', 'expense'),
      ('Ubrania', 'expense'),
      ('Edukacja', 'expense'),
      ('Elektronika', 'expense'),
      ('Restauracje', 'expense'),
      ('Sport i rekreacja', 'expense'),
      ('Podróże', 'expense'),
      ('Ubezpieczenia', 'expense'),
      ('Subskrypcje', 'expense'),
      ('Inne wydatki', 'expense'),
      ('Wynagrodzenie', 'income'),
      ('Freelance', 'income'),
      ('Premia', 'income'),
      ('Zwrot', 'income'),
      ('Prezent', 'income'),
      ('Inwestycje', 'income'),
      ('Inne przychody', 'income')
  ) as seed(name, type)
  where not exists (
    select 1 from categories c
    where c.user_id = p_user_id
      and c.name = seed.name
      and c.type = seed.type::transaction_type
  );
end;
$$;

create or replace function seed_default_categories_on_profile()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform seed_default_categories(new.id);
  return new;
end;
$$;

drop trigger if exists seed_default_categories_after_profile_insert on profiles;
create trigger seed_default_categories_after_profile_insert
  after insert on profiles
  for each row execute function seed_default_categories_on_profile();

-- Backfill any existing user who somehow has no categories (defensive).
do $$
declare
  r record;
begin
  for r in select id from profiles loop
    perform seed_default_categories(r.id);
  end loop;
end $$;
