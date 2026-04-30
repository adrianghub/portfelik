create or replace function duplicate_shopping_list(p_list_id uuid)
returns shopping_lists
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source shopping_lists;
  v_new_list shopping_lists;
begin
  select * into v_source from shopping_lists where id = p_list_id;
  if not found then
    raise exception 'shopping_list_not_found';
  end if;

  insert into shopping_lists (name, status, user_id, group_id, category_id)
  values (v_source.name || ' (kopia)', 'active', auth.uid(), v_source.group_id, v_source.category_id)
  returning * into v_new_list;

  insert into shopping_list_items (shopping_list_id, name, completed, quantity, unit, position)
  select v_new_list.id, name, false, quantity, unit, position
  from shopping_list_items
  where shopping_list_id = p_list_id
  order by position;

  return v_new_list;
end;
$$;

grant execute on function duplicate_shopping_list(uuid) to authenticated;
