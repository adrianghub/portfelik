-- P0-3C: lock categorization_rule kind (semantic contract).
-- Editors previously coerced type/composite → contains and cleared match_type.
-- Change of matching mode = delete + create a new rule.

-- ---------------------------------------------------------------------------
-- 1. Revoke UPDATE on kind (user_id already immutable)
-- ---------------------------------------------------------------------------
revoke update on table public.categorization_rules from authenticated;
grant update (
  match_description,
  match_counterparty,
  match_type,
  match_day_of_month,
  category_id,
  priority
) on table public.categorization_rules to authenticated;

comment on column public.categorization_rules.kind is
  'Immutable matching semantics from the client (column GRANT excludes kind). Change mode via delete+create.';

-- ---------------------------------------------------------------------------
-- 2. Defense-in-depth: reject kind flips / required field clears
-- ---------------------------------------------------------------------------
create or replace function public.prevent_categorization_rule_semantics_downgrade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'rule_kind_immutable' using errcode = 'P0001';
  end if;

  if old.kind in ('type', 'composite') and new.match_type is null then
    raise exception 'rule_match_type_required' using errcode = 'P0001';
  end if;

  if old.kind in ('exact', 'contains', 'composite')
     and new.match_description is null
     and new.match_counterparty is null then
    raise exception 'rule_text_required' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_categorization_rule_semantics_downgrade
  on public.categorization_rules;
create trigger prevent_categorization_rule_semantics_downgrade
  before update
  on public.categorization_rules
  for each row
  execute function public.prevent_categorization_rule_semantics_downgrade();

comment on function public.prevent_categorization_rule_semantics_downgrade() is
  'Keeps rule kind fixed and blocks clearing kind-required match fields.';
