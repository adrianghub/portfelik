-- =============================================================================
-- Portfelik — Seed Data
-- Run via: supabase db seed (local) or manually against a fresh instance.
--
-- System categories: user_id IS NULL.
-- Visible to all authenticated users; writable only by admins.
-- Names are in Polish (pl) — the primary locale of the application.
-- =============================================================================

insert into categories (name, type, user_id)
select seed.name, seed.type::transaction_type, null
from (
  values
    -- Expense categories
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

    -- Income categories
    ('Wynagrodzenie', 'income'),
    ('Freelance', 'income'),
    ('Premia', 'income'),
    ('Zwrot', 'income'),
    ('Prezent', 'income'),
    ('Inwestycje', 'income'),
    ('Inne przychody', 'income')
) as seed(name, type)
where not exists (
  select 1
  from categories c
  where c.user_id is null
    and c.name = seed.name
    and c.type = seed.type::transaction_type
);
