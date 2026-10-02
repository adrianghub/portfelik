-- Archival preserves category identity, historical labels and stored rules.
alter table public.categories add column archived_at timestamptz;
grant update (archived_at) on public.categories to authenticated;
alter table public.categories add constraint categories_default_remains_active
  check (archived_at is null or lower(btrim(name)) not in ('inne', 'inne wydatki', 'inne przychody'));

-- A category referenced by a rule must not cascade-delete that rule.
alter table public.categorization_rules drop constraint categorization_rules_category_id_fkey;
alter table public.categorization_rules add constraint categorization_rules_category_id_fkey
  foreign key (category_id) references public.categories(id)
  on delete no action deferrable initially deferred;

create function public.enforce_active_category_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_category_id uuid;
begin
  if tg_table_name = 'transaction_import_rows' then
    v_category_id := new.selected_category_id;
    if tg_op = 'UPDATE' and new.selected_category_id is not distinct from old.selected_category_id then return new; end if;
  else
    v_category_id := new.category_id;
    if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then return new; end if;
  end if;
  if v_category_id is null then return new; end if;
  if exists (select 1 from public.categories c where c.id = v_category_id and c.archived_at is not null) then
    -- Materialized occurrences retain the category of their existing series.
    -- Archival must not rewrite or interrupt previously scheduled obligations.
    if tg_table_name = 'transactions' then
      -- Account deletion transfers historical custody to the group owner.
      -- Equivalent labels remain historical even if that owner archived theirs.
      if tg_op = 'UPDATE' and old.user_id = auth.uid()
        and new.user_id is distinct from old.user_id and new.group_id = old.group_id
        and exists (
          select 1 from public.user_groups g
          join public.categories source on source.id = old.category_id
          join public.categories destination on destination.id = v_category_id
          where g.id = old.group_id and g.owner_id = new.user_id
            and destination.user_id = new.user_id
            and source.type = destination.type and lower(source.name) = lower(destination.name)
        ) then return new; end if;
      if new.recurring_template_id is not null and exists (
        select 1 from public.transactions t where t.id = new.recurring_template_id
          and t.is_recurring and t.category_id = v_category_id
      ) then return new; end if;
    end if;
    raise exception 'category_archived' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_active_category_assignment() from public, anon, authenticated, service_role;
create trigger transactions_active_category before insert or update of category_id on public.transactions
  for each row execute function public.enforce_active_category_assignment();
create trigger rules_active_category before insert or update of category_id on public.categorization_rules
  for each row execute function public.enforce_active_category_assignment();
create trigger import_rows_active_category before insert or update of selected_category_id on public.transaction_import_rows
  for each row execute function public.enforce_active_category_assignment();

-- Saved previews must ask for a fresh category instead of failing at commit.
create function public.clear_archived_preview_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    update public.transaction_import_rows r set selected_category_id = null
    from public.transaction_import_sessions s
    where r.session_id = s.id and s.status = 'preview'
      and r.selected_category_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_archived_preview_categories() from public, anon, authenticated, service_role;
create trigger categories_clear_archived_previews after update of archived_at on public.categories
  for each row execute function public.clear_archived_preview_categories();
