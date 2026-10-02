-- Presentation preferences never change ledger identity or financial semantics.
alter table public.categories
  add column color text check (color is null or color in ('#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#22d3ee', '#f472b6', '#fb923c')),
  add column icon text check (icon is null or icon in ('tag', 'shopping-basket', 'home', 'car', 'heart', 'utensils', 'briefcase', 'wallet', 'target', 'landmark', 'plane', 'graduation-cap'));
alter table public.plans
  add column icon text check (icon is null or icon in ('tag', 'shopping-basket', 'home', 'car', 'heart', 'utensils', 'briefcase', 'wallet', 'target', 'landmark', 'plane', 'graduation-cap'));
grant insert (color, icon), update (color, icon) on public.categories to authenticated;
grant insert (icon), update (icon) on public.plans to authenticated;
