-- Installed pre-V2 clients omit match_operator and still evaluate text as OR.
-- Keep their writes compatible during a rolling web/Android upgrade. V2 clients
-- explicitly insert 'all'; existing rows and UPDATE grants remain unchanged.
alter table public.categorization_rules
  alter column match_operator set default 'any';
