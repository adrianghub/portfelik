-- Persist optional day-of-month constraint on categorization rules.
--
-- The import review rule editor writes match_day_of_month and the client
-- matcher already honors it; the column and UPDATE grant were missing, so
-- saves appeared to succeed but the date filter was dropped on refresh.

alter table public.categorization_rules
  add column if not exists match_day_of_month smallint
  check (match_day_of_month is null or (match_day_of_month >= 1 and match_day_of_month <= 31));

comment on column public.categorization_rules.match_day_of_month is
  'Optional calendar-day filter (1–31). Null means any day of month.';

grant update (match_day_of_month) on table public.categorization_rules to authenticated;

-- Extend duplicate identity to include day-of-month (mirrors client isEquivalentCategorizationRule).
drop index if exists public.categorization_rules_duplicate_identity_uidx;

create unique index categorization_rules_duplicate_identity_uidx
  on public.categorization_rules (
    user_id,
    kind,
    coalesce(lower(btrim(regexp_replace(match_description, '\s+', ' ', 'g'))), ''),
    coalesce(lower(btrim(regexp_replace(match_counterparty, '\s+', ' ', 'g'))), ''),
    match_type,
    match_day_of_month,
    category_id
  ) nulls not distinct;
