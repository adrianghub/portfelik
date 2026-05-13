alter table shopping_lists
  add column if not exists completed_at timestamptz;

comment on column shopping_lists.completed_at is
  'Event timestamp for the first transition to completed. Used for completion analytics; unlike updated_at, edits after completion do not move it.';

update shopping_lists
set completed_at = updated_at
where status = 'completed'
  and completed_at is null;

create index if not exists idx_shopping_lists_status_completed_at
  on shopping_lists (status, completed_at desc)
  where status = 'completed';

create or replace function set_shopping_list_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at = now();
    elsif old.status = 'completed' then
      new.completed_at = old.completed_at;
    end if;
  else
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_completed_at on shopping_lists;
create trigger set_completed_at
  before insert or update on shopping_lists
  for each row execute function set_shopping_list_completed_at();
