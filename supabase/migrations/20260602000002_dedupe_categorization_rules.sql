-- Forward-only: prevent duplicate categorization rules after the import
-- "save as rule" action becomes one-tap and suggestion-driven.
--
-- Duplicate identity:
--   user_id + kind + normalized match_description + normalized
--   match_counterparty + match_type + category_id
--
-- Normalization intentionally mirrors the client helper: trim, collapse
-- whitespace, lower-case. Existing duplicates are removed first, keeping the
-- highest priority rule and then the earliest created rule.

with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        kind,
        coalesce(lower(btrim(regexp_replace(match_description, '\s+', ' ', 'g'))), ''),
        coalesce(lower(btrim(regexp_replace(match_counterparty, '\s+', ' ', 'g'))), ''),
        match_type,
        category_id
      order by priority desc, created_at asc, id asc
    ) as rn
  from public.categorization_rules
)
delete from public.categorization_rules r
using ranked d
where r.id = d.id
  and d.rn > 1;

create unique index if not exists categorization_rules_duplicate_identity_uidx
  on public.categorization_rules (
    user_id,
    kind,
    coalesce(lower(btrim(regexp_replace(match_description, '\s+', ' ', 'g'))), ''),
    coalesce(lower(btrim(regexp_replace(match_counterparty, '\s+', ' ', 'g'))), ''),
    match_type,
    category_id
  ) nulls not distinct;
