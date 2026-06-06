-- MVP+ plan settlement: dedicated link table + RPCs.
-- Settles user-facing Plans against existing ledger transactions without
-- expanding transactions.shopping_list_id.

create table plan_transaction_links (
  id              uuid        primary key default gen_random_uuid(),
  plan_id         uuid        not null references shopping_lists(id) on delete cascade,
  transaction_id  uuid        not null references transactions(id) on delete cascade,
  created_by      uuid        not null default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint plan_transaction_links_plan_tx_unique unique (plan_id, transaction_id),
  constraint plan_transaction_links_tx_unique unique (transaction_id)
);

comment on table plan_transaction_links is
  'MVP+ plan settlement links. One plan per transaction in MVP+. RPC-write-only.';

create index plan_transaction_links_plan_id_idx on plan_transaction_links(plan_id);
create index plan_transaction_links_transaction_id_idx on plan_transaction_links(transaction_id);

alter table plan_transaction_links enable row level security;

create policy "plan_transaction_links: read when plan and tx visible"
  on plan_transaction_links for select
  to authenticated
  using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = plan_transaction_links.plan_id
        and (
          sl.user_id = (select auth.uid())
          or (sl.group_id is not null and (select is_group_member(sl.group_id)))
        )
    )
    and exists (
      select 1 from transactions t
      where t.id = plan_transaction_links.transaction_id
        and (
          t.user_id = (select auth.uid())
          or exists (
            select 1 from group_members gm1
            join group_members gm2 on gm1.group_id = gm2.group_id
            where gm1.user_id = (select auth.uid())
              and gm2.user_id = t.user_id
          )
        )
    )
  );

create policy "plan_transaction_links: no direct writes"
  on plan_transaction_links for all
  to authenticated
  using (false)
  with check (false);

grant select on table plan_transaction_links to authenticated;

-- ---------------------------------------------------------------------------
-- link_plan_transaction(plan_id, transaction_id)
-- ---------------------------------------------------------------------------
create or replace function link_plan_transaction(
  p_plan_id        uuid,
  p_transaction_id uuid
)
  returns plan_transaction_links
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_plan shopping_lists;
  v_tx   transactions;
  v_link plan_transaction_links;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_plan from shopping_lists where id = p_plan_id;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  if v_plan.user_id <> auth.uid()
    and not (v_plan.group_id is not null and is_group_member(v_plan.group_id))
  then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  select * into v_tx from transactions where id = p_transaction_id;
  if v_tx is null then
    raise exception 'transaction_not_found' using errcode = 'P0001';
  end if;

  if v_tx.user_id <> auth.uid()
    and not (v_tx.group_id is not null and is_group_member(v_tx.group_id))
    and not exists (
      select 1 from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid()
        and gm2.user_id = v_tx.user_id
    )
  then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;

  if v_tx.type <> 'expense' then
    raise exception 'transaction_must_be_expense' using errcode = 'P0001';
  end if;

  if v_plan.group_id is not null then
    if v_tx.group_id is distinct from v_plan.group_id then
      raise exception 'group_scope_mismatch'
        using errcode = 'P0001',
              hint = 'Plan and transaction must share the same group scope.';
    end if;
  elsif v_tx.user_id <> v_plan.user_id then
    raise exception 'private_scope_mismatch'
      using errcode = 'P0001',
            hint = 'Private plans can only link to the owner''s transactions.';
  end if;

  if exists (
    select 1 from plan_transaction_links
    where transaction_id = p_transaction_id
      and plan_id <> p_plan_id
  ) then
    raise exception 'transaction_already_linked'
      using errcode = 'P0001',
            hint = 'Unlink from the other plan first.';
  end if;

  insert into plan_transaction_links (plan_id, transaction_id, created_by)
  values (p_plan_id, p_transaction_id, auth.uid())
  on conflict (plan_id, transaction_id) do update
    set created_at = plan_transaction_links.created_at
  returning * into v_link;

  return v_link;
end;
$$;

comment on function link_plan_transaction(uuid, uuid) is
  'Link an existing expense transaction to a plan. Enforces private/group scope compatibility.';

-- ---------------------------------------------------------------------------
-- unlink_plan_transaction(plan_id, transaction_id)
-- ---------------------------------------------------------------------------
create or replace function unlink_plan_transaction(
  p_plan_id        uuid,
  p_transaction_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_plan shopping_lists;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_plan from shopping_lists where id = p_plan_id;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  if v_plan.user_id <> auth.uid()
    and not (v_plan.group_id is not null and is_group_member(v_plan.group_id))
  then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;

  delete from plan_transaction_links
  where plan_id = p_plan_id
    and transaction_id = p_transaction_id;

  if not found then
    raise exception 'link_not_found' using errcode = 'P0001';
  end if;
end;
$$;

comment on function unlink_plan_transaction(uuid, uuid) is
  'Remove a plan-to-transaction settlement link.';

revoke all on function link_plan_transaction(uuid, uuid) from public;
revoke all on function link_plan_transaction(uuid, uuid) from anon;
revoke all on function unlink_plan_transaction(uuid, uuid) from public;
revoke all on function unlink_plan_transaction(uuid, uuid) from anon;

grant execute on function link_plan_transaction(uuid, uuid) to authenticated;
grant execute on function unlink_plan_transaction(uuid, uuid) to authenticated;

-- Fix grant for the 4-arg complete_shopping_list signature (boolean flag).
grant execute on function complete_shopping_list(uuid, numeric, uuid, boolean) to authenticated;
