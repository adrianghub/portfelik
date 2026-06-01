-- Phase 11.2 - Data integrity hardening
-- Applied 2026-05-15.
-- Trim trailing/leading whitespace in existing names; add length-check constraints.
-- Pre-check confirmed no NULL/empty-name rows; no deletes needed.

update public.shopping_list_items
   set name = btrim(name)
 where name <> btrim(name);

update public.shopping_lists
   set name = btrim(name)
 where name <> btrim(name);

alter table public.shopping_list_items
  add constraint shopping_list_items_name_nonempty
  check (length(btrim(name)) > 0);

alter table public.shopping_lists
  add constraint shopping_lists_name_nonempty
  check (length(btrim(name)) > 0);

comment on constraint shopping_list_items_name_nonempty
  on public.shopping_list_items
  is 'Phase 11.2: reject blank/whitespace-only names at the DB layer (paired with service-level trim in shopping-lists.ts).';

comment on constraint shopping_lists_name_nonempty
  on public.shopping_lists
  is 'Phase 11.2: reject blank/whitespace-only list titles at the DB layer (paired with service-level trim in shopping-lists.ts).';
