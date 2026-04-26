-- =============================================================================
-- Portfelik — Seed Data
-- Run via: supabase db seed (local) or manually against a fresh instance.
--
-- System categories: user_id IS NULL.
-- Visible to all authenticated users; writable only by admins.
-- Names are in Polish (pl) — the primary locale of the application.
-- =============================================================================

insert into categories (name, type, user_id) values

  -- Expense categories
  ('Jedzenie i zakupy',   'expense', null),
  ('Transport',           'expense', null),
  ('Mieszkanie',          'expense', null),
  ('Rozrywka',            'expense', null),
  ('Zdrowie',             'expense', null),
  ('Ubrania',             'expense', null),
  ('Edukacja',            'expense', null),
  ('Elektronika',         'expense', null),
  ('Restauracje',         'expense', null),
  ('Sport i rekreacja',   'expense', null),
  ('Podróże',             'expense', null),
  ('Ubezpieczenia',       'expense', null),
  ('Subskrypcje',         'expense', null),
  ('Inne wydatki',        'expense', null),

  -- Income categories
  ('Wynagrodzenie',       'income', null),
  ('Freelance',           'income', null),
  ('Premia',              'income', null),
  ('Zwrot',               'income', null),
  ('Prezent',             'income', null),
  ('Inwestycje',          'income', null),
  ('Inne przychody',      'income', null);
