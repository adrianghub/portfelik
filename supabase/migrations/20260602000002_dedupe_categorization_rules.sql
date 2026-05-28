-- Forward-only: prevent duplicate categorization rules after the import
-- "save as rule" action becomes one-tap and suggestion-driven.
--
-- Duplicate identity:
--   user_id + kind + normalized match_description + normalized
--   match_counterparty + match_type + category_id
--
-- Normalization intentionally mirrors the client helper: trim, collapse
-- whitespace, lower-case. This migration never deletes user rules. If existing
-- duplicates are present, it aborts before creating the unique index so the
-- duplicates can be reviewed and cleaned up intentionally.

do $$
declare
  v_duplicate_groups integer;
  v_duplicate_rows integer;
begin
  with duplicate_groups as (
    select count(*) as row_count
    from public.categorization_rules
    group by
        user_id,
        kind,
        coalesce(lower(btrim(regexp_replace(match_description, '\s+', ' ', 'g'))), ''),
        coalesce(lower(btrim(regexp_replace(match_counterparty, '\s+', ' ', 'g'))), ''),
        match_type,
        category_id
    having count(*) > 1
  )
  select
    count(*),
    coalesce(sum(row_count), 0)
  into v_duplicate_groups, v_duplicate_rows
  from duplicate_groups;

  if v_duplicate_groups > 0 then
    raise exception
      'Cannot create categorization_rules_duplicate_identity_uidx: found % duplicate identity groups covering % rows. Review duplicate categorization_rules manually before applying this migration.',
      v_duplicate_groups,
      v_duplicate_rows
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists categorization_rules_duplicate_identity_uidx
  on public.categorization_rules (
    user_id,
    kind,
    coalesce(lower(btrim(regexp_replace(match_description, '\s+', ' ', 'g'))), ''),
    coalesce(lower(btrim(regexp_replace(match_counterparty, '\s+', ' ', 'g'))), ''),
    match_type,
    category_id
  ) nulls not distinct;
