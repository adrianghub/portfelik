-- Persist the category actually used by commit, including its uncategorized
-- fallback. Never resolve history from a transaction that may be edited later.
create function public.snapshot_import_committed_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select t.category_id into new.selected_category_id
    from public.transactions t
    join public.transaction_import_sessions s on s.id = new.session_id
   where t.id = new.transaction_id
     and t.user_id = s.user_id
     and s.status = 'preview';
  return new;
end;
$$;

revoke all on function public.snapshot_import_committed_category()
  from public, anon, authenticated, service_role;

create trigger import_rows_snapshot_committed_category
before update of transaction_id on public.transaction_import_rows
for each row
when (
  old.transaction_id is null
  and new.transaction_id is not null
  and new.decision = 'import'
  and new.selected_category_id is null
)
execute function public.snapshot_import_committed_category();

-- Older committed rows remain unchanged: a linked transaction's current
-- category cannot reliably reconstruct the category at their original commit.
