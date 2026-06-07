-- P1: owners cannot attach plans to groups they do not belong to; only the
-- plan creator may change group_id (same posture as transactions).

drop policy if exists "plans: update own or co-owner" on public.plans;

create policy "plans: update own or co-owner"
  on public.plans for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  )
  with check (
    (
      user_id = (select auth.uid())
      and (
        group_id is null
        or (select public.is_group_member(group_id))
      )
    )
    or (
      user_id <> (select auth.uid())
      and group_id is not null
      and (select public.is_group_co_owner(group_id))
    )
  );

create or replace function enforce_plan_group_id_owner_only()
  returns trigger
  language plpgsql
  security invoker
  set search_path = public
as $$
begin
  if new.group_id is distinct from old.group_id and old.user_id <> (select auth.uid()) then
    raise exception 'only_owner_can_change_group_id'
      using errcode = 'P0001',
            hint = 'Only the plan creator can move it to or from a group.';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_group_id_owner_only on public.plans;
create trigger plan_group_id_owner_only
  before update of group_id on public.plans
  for each row
  execute function enforce_plan_group_id_owner_only();

comment on function enforce_plan_group_id_owner_only() is
  'Only the plan creator may change group_id. Co-owners may edit other fields.';
