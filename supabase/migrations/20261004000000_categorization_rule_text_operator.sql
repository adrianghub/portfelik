-- Make text semantics explicit without changing any existing rule's behavior.
-- Identical description/counterparty values cannot establish that a rule was
-- generated automatically: collapsing them would stop counterparty-only matches.
alter table public.categorization_rules
  add column match_operator text not null default 'any'
  check (match_operator in ('all', 'any'));

-- Existing rows retain OR. New rows, including inserts that omit the field, use AND.
alter table public.categorization_rules
  alter column match_operator set default 'all';

comment on column public.categorization_rules.match_operator is
  'Text-field operator: all = AND, any = legacy OR. Type/day conditions always apply. Immutable from authenticated clients.';

-- The existing column UPDATE grant deliberately excludes the new operator.
-- Do not broaden it: editing conditions must not silently convert legacy semantics.
drop index public.categorization_rules_duplicate_identity_uidx;
create unique index categorization_rules_duplicate_identity_uidx
  on public.categorization_rules (
    user_id,
    kind,
    (case when match_description is not null and match_counterparty is not null
      then match_operator else 'all' end),
    coalesce(lower(btrim(regexp_replace(match_description, '\s+', ' ', 'g'))), ''),
    coalesce(lower(btrim(regexp_replace(match_counterparty, '\s+', ' ', 'g'))), ''),
    match_type,
    match_day_of_month,
    category_id
  ) nulls not distinct;
