-- Save-goal contributions are expenses moved from cash into a goal asset.

-- Preserve only synthetic legacy goal deposits; never rewrite genuine income.
do $$
declare
  r record;
  v_goal_category_id uuid;
begin
  for r in
    select distinct t.user_id
    from public.plan_transaction_links l
    join public.plans p on p.id = l.plan_id and p.kind = 'save'
    join public.transactions t on t.id = l.transaction_id and t.type = 'income'
    join public.categories c on c.id = t.category_id and c.name = 'Wpłata na cel'
  loop
    perform public.seed_default_categories(r.user_id);
    select id into v_goal_category_id
    from public.categories
    where user_id = r.user_id and name = 'Cele' and type = 'expense'
    order by created_at limit 1;

    update public.transactions t
    set type = 'expense', category_id = v_goal_category_id, updated_at = now()
    where t.user_id = r.user_id
      and t.type = 'income'
      and exists (
        select 1 from public.plan_transaction_links l
        join public.plans p on p.id = l.plan_id and p.kind = 'save'
        join public.categories c on c.id = t.category_id and c.name = 'Wpłata na cel'
        where l.transaction_id = t.id
      );
  end loop;
end;
$$;

delete from public.plan_transaction_links l
using public.plans p, public.transactions t
where l.plan_id = p.id and l.transaction_id = t.id
  and p.kind = 'save' and t.type = 'income';

create or replace function public.link_plan_transaction(
  p_plan_id uuid,
  p_transaction_id uuid
)
returns public.plan_transaction_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
  v_tx public.transactions;
  v_link public.plan_transaction_links;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan is null then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
  if v_plan.user_id <> auth.uid()
    and not (v_plan.group_id is not null and public.is_group_member(v_plan.group_id)) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx is null then raise exception 'transaction_not_found' using errcode = 'P0001'; end if;
  if v_tx.user_id <> auth.uid()
    and not (v_tx.group_id is not null and public.is_group_member(v_tx.group_id)) then
    raise exception 'not_authorized_transaction' using errcode = 'P0001';
  end if;
  if v_tx.type <> 'expense' then
    raise exception 'transaction_must_be_expense' using errcode = 'P0001';
  end if;
  if v_tx.date::date < v_plan.start_date or v_tx.date::date > v_plan.end_date then
    raise exception 'transaction_outside_plan_period' using errcode = 'P0001';
  end if;
  if v_plan.group_id is not null then
    if v_tx.group_id is distinct from v_plan.group_id then
      raise exception 'group_scope_mismatch' using errcode = 'P0001';
    end if;
  elsif v_tx.user_id <> v_plan.user_id or v_tx.group_id is not null then
    raise exception 'private_scope_mismatch' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.plan_transaction_links
    where transaction_id = p_transaction_id and plan_id <> p_plan_id
  ) then raise exception 'transaction_already_linked' using errcode = 'P0001'; end if;

  insert into public.plan_transaction_links (plan_id, transaction_id, created_by)
  values (p_plan_id, p_transaction_id, auth.uid())
  on conflict (plan_id, transaction_id) do update
    set created_at = public.plan_transaction_links.created_at
  returning * into v_link;
  return v_link;
end;
$$;

create or replace function public.lock_linked_transaction_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type <> 'expense' and exists (
    select 1 from public.plan_transaction_links where transaction_id = old.id
  ) then
    raise exception 'transaction_type_locked_by_plan_link' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger lock_linked_transaction_type
before update of type on public.transactions
for each row when (old.type is distinct from new.type)
execute function public.lock_linked_transaction_type();

create or replace function public.add_plan_contribution(
  p_plan_id uuid,
  p_amount numeric,
  p_date date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans;
  v_category_id uuid;
  v_transaction_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_date is null then raise exception 'invalid_date' using errcode = 'P0001'; end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if v_plan is null or v_plan.kind <> 'save' then
    raise exception 'save_plan_not_found' using errcode = 'P0001';
  end if;
  if v_plan.user_id <> v_uid
    and not (v_plan.group_id is not null and public.is_group_member(v_plan.group_id)) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;
  if p_date < v_plan.start_date or p_date > v_plan.end_date then
    raise exception 'transaction_outside_plan_period' using errcode = 'P0001';
  end if;

  perform public.seed_default_categories(v_uid);
  select id into v_category_id from public.categories
  where user_id = v_uid and name = 'Cele' and type = 'expense'
  order by created_at limit 1;
  if v_category_id is null then raise exception 'goal_category_missing' using errcode = 'P0001'; end if;

  insert into public.transactions (
    amount, currency, description, date, type, status, category_id, user_id, group_id
  ) values (
    p_amount, 'PLN', coalesce(nullif(btrim(p_description), ''), 'Wpłata na cel'),
    p_date::timestamptz, 'expense', 'paid', v_category_id, v_uid, v_plan.group_id
  ) returning id into v_transaction_id;

  perform public.link_plan_transaction(p_plan_id, v_transaction_id);
  return v_transaction_id;
end;
$$;

create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into categories (name, type, user_id)
  select seed.name, seed.type::transaction_type, p_user_id
  from (values
    ('Jedzenie i zakupy', 'expense'), ('Transport', 'expense'),
    ('Mieszkanie', 'expense'), ('Rozrywka', 'expense'), ('Zdrowie', 'expense'),
    ('Ubrania', 'expense'), ('Edukacja', 'expense'), ('Elektronika', 'expense'),
    ('Restauracje', 'expense'), ('Sport i rekreacja', 'expense'), ('Podróże', 'expense'),
    ('Ubezpieczenia', 'expense'), ('Subskrypcje', 'expense'), ('Cele', 'expense'),
    ('Inne wydatki', 'expense'), ('Wynagrodzenie', 'income'), ('Freelance', 'income'),
    ('Premia', 'income'), ('Zwrot', 'income'), ('Prezent', 'income'),
    ('Inwestycje', 'income'), ('Inne przychody', 'income')
  ) as seed(name, type)
  where not exists (
    select 1 from categories c where c.user_id = p_user_id
      and c.name = seed.name and c.type = seed.type::transaction_type
  );
end;
$$;

delete from public.categories c
where c.name = 'Wpłata na cel' and c.type = 'income'
  and not exists (select 1 from public.transactions t where t.category_id = c.id)
  and not exists (select 1 from public.categorization_rules r where r.category_id = c.id)
  and not exists (select 1 from public.plans p where p.category_id = c.id);

revoke all on function public.add_plan_contribution(uuid, numeric, date, text) from public, anon;
grant execute on function public.add_plan_contribution(uuid, numeric, date, text) to authenticated;
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;

comment on function public.add_plan_contribution(uuid, numeric, date, text) is
  'Atomically records a paid Cele expense and links it to an accessible save plan.';
