-- Optional spending cap on a category the user owns.
-- month: groceries reset each calendar month.
-- year: a longer pile such as health.
-- Null means the category is only a label, not a pile.

alter table public.categories
  add column cap_amount numeric(12, 2),
  add column cap_period text;

alter table public.categories
  add constraint categories_cap_period_check
  check (cap_period is null or cap_period in ('month', 'year'));

alter table public.categories
  add constraint categories_cap_pair_check
  check (
    (cap_amount is null and cap_period is null)
    or (
      type = 'expense'
      and cap_amount is not null
      and cap_amount > 0
      and cap_period is not null
    )
  );

comment on column public.categories.cap_amount is
  'How much may leave the account in cap_period. Null = no pile.';
comment on column public.categories.cap_period is
  'month or year. Together with cap_amount, the bar on the dashboard.';
