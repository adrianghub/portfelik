-- Item-level category for shopping_list_items.
-- Free-text column matching the unit pattern; NULL = uncategorised (rendered under "Inne" client-side).
-- Vocabulary lives in apps/web-svelte/src/lib/shopping-list-categories.ts.

alter table shopping_list_items
  add column if not exists category text;

alter table shopping_list_items
  drop constraint if exists shopping_list_items_category_nonempty;

alter table shopping_list_items
  add constraint shopping_list_items_category_nonempty
  check (category is null or length(btrim(category)) > 0);

create table if not exists shopping_item_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_item_categories_name_nonempty check (length(btrim(name)) > 0),
  constraint shopping_item_categories_user_name_unique unique (user_id, name)
);

create index if not exists idx_shopping_item_categories_user_position
  on shopping_item_categories(user_id, position, name);

alter table shopping_item_categories enable row level security;

drop policy if exists "shopping item categories read own" on shopping_item_categories;
create policy "shopping item categories read own"
  on shopping_item_categories for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "shopping item categories insert own" on shopping_item_categories;
create policy "shopping item categories insert own"
  on shopping_item_categories for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "shopping item categories update own" on shopping_item_categories;
create policy "shopping item categories update own"
  on shopping_item_categories for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "shopping item categories delete own" on shopping_item_categories;
create policy "shopping item categories delete own"
  on shopping_item_categories for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists set_shopping_item_categories_updated_at on shopping_item_categories;
create trigger set_shopping_item_categories_updated_at
  before update on shopping_item_categories
  for each row execute function handle_updated_at();

grant select, insert, update, delete on shopping_item_categories to authenticated;
