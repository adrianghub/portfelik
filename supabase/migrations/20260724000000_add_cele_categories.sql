-- Goal-oriented default categories: Cele (expense) and Wpłata na cel (income).
-- Idempotent backfill for existing users via seed_default_categories.

create or replace function public.seed_default_categories(p_user_id uuid)
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
      ('Cele', 'expense'),
      ('Inne wydatki', 'expense'),
      ('Wynagrodzenie', 'income'),
      ('Freelance', 'income'),
      ('Premia', 'income'),
      ('Zwrot', 'income'),
      ('Prezent', 'income'),
      ('Inwestycje', 'income'),
      ('Wpłata na cel', 'income'),
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

comment on function public.seed_default_categories(uuid) is
  'Internal: per-user default category seed including Cele / Wpłata na cel. Callable from triggers and definer RPCs only.';

-- Backfill existing users who registered before Cele categories existed.
do $$
declare
  r record;
begin
  for r in select id from profiles loop
    perform public.seed_default_categories(r.id);
  end loop;
end;
$$;
