-- P0-4B: atomic debt-plan create/edit — plans + plan_debt_terms in one transaction.
-- SECURITY INVOKER: RLS enforces manager rules (same as direct-table path).

create or replace function public.save_debt_plan(
  p_plan_id              uuid,
  p_name                 text,
  p_group_id             uuid,
  p_category_id          uuid,
  p_start_date           date,
  p_end_date             date,
  p_target_amount        numeric,
  p_original_amount      numeric,
  p_current_balance      numeric,
  p_annual_rate          numeric,
  p_monthly_payment      numeric,
  p_first_payment_date   date,
  p_first_payment_amount numeric,
  p_reset_balance_anchor boolean default false,
  p_clear_balance_anchor boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_original numeric;
  v_balance numeric;
  v_rate numeric;
  v_payment numeric;
  v_plan public.plans;
  v_terms public.plan_debt_terms;
  v_existing public.plan_debt_terms;
  v_anchor_balance numeric;
  v_anchor_date date;
  v_target numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'date_required' using errcode = 'P0001';
  end if;

  if p_end_date < p_start_date then
    raise exception 'date_order' using errcode = 'P0001';
  end if;

  v_original := abs(coalesce(p_original_amount, 0));
  v_payment := abs(coalesce(p_monthly_payment, 0));
  v_rate := coalesce(p_annual_rate, 0);
  v_balance := abs(
    case
      when p_current_balance is null or p_current_balance <> p_current_balance then v_original
      else p_current_balance
    end
  );

  if v_original <= 0 then
    raise exception 'debt_original_required' using errcode = 'P0001';
  end if;
  if v_payment <= 0 then
    raise exception 'debt_payment_required' using errcode = 'P0001';
  end if;
  if v_rate < 0 then
    raise exception 'debt_rate_invalid' using errcode = 'P0001';
  end if;
  if v_balance > v_original then
    raise exception 'debt_balance_exceeds_original' using errcode = 'P0001';
  end if;

  v_target := case
    when p_target_amount is not null and p_target_amount > 0 then abs(p_target_amount)
    else v_original
  end;

  if p_plan_id is not null then
    select * into v_plan
    from public.plans
    where id = p_plan_id and kind = 'debt';

    if v_plan is null then
      raise exception 'plan_not_found' using errcode = 'P0001';
    end if;

    if v_plan.status is distinct from 'active' then
      raise exception 'plan_not_active' using errcode = 'P0001';
    end if;

    if v_plan.start_date is distinct from p_start_date
       or v_plan.end_date is distinct from p_end_date then
      if exists (
        select 1
        from public.plan_transaction_links l
        join public.transactions t on t.id = l.transaction_id
        where l.plan_id = p_plan_id
          and (
            t.date::date < p_start_date
            or t.date::date > p_end_date
          )
      ) then
        raise exception 'transaction_outside_plan_period' using errcode = 'P0001';
      end if;
    end if;

    select * into v_existing
    from public.plan_debt_terms
    where plan_id = p_plan_id;
  end if;

  if p_clear_balance_anchor then
    v_anchor_balance := null;
    v_anchor_date := null;
  elsif p_reset_balance_anchor then
    v_anchor_balance := v_balance;
    v_anchor_date := public.product_local_date();
  elsif v_existing.plan_id is not null then
    v_anchor_balance := v_existing.anchor_balance;
    v_anchor_date := v_existing.balance_anchor_date;
  else
    v_anchor_balance := v_balance;
    v_anchor_date := public.product_local_date();
  end if;

  if p_plan_id is null then
    insert into public.plans (
      name, user_id, group_id, category_id, kind, target_amount,
      start_date, end_date, status
    ) values (
      v_name, v_uid, p_group_id, p_category_id, 'debt', v_target,
      p_start_date, p_end_date, 'active'
    )
    returning * into v_plan;

    insert into public.plan_debt_terms (
      plan_id, original_amount, current_balance, annual_rate, monthly_payment,
      anchor_balance, balance_anchor_date, first_payment_date, first_payment_amount
    ) values (
      v_plan.id, v_original, v_balance, v_rate, v_payment,
      v_anchor_balance, v_anchor_date, p_first_payment_date, p_first_payment_amount
    )
    returning * into v_terms;
  else
    update public.plans set
      name = v_name,
      group_id = p_group_id,
      category_id = p_category_id,
      target_amount = v_target,
      start_date = p_start_date,
      end_date = p_end_date,
      updated_at = now()
    where id = p_plan_id
    returning * into v_plan;

    insert into public.plan_debt_terms (
      plan_id, original_amount, current_balance, annual_rate, monthly_payment,
      anchor_balance, balance_anchor_date, first_payment_date, first_payment_amount
    ) values (
      p_plan_id, v_original, v_balance, v_rate, v_payment,
      v_anchor_balance, v_anchor_date, p_first_payment_date, p_first_payment_amount
    )
    on conflict (plan_id) do update set
      original_amount = excluded.original_amount,
      current_balance = excluded.current_balance,
      annual_rate = excluded.annual_rate,
      monthly_payment = excluded.monthly_payment,
      anchor_balance = excluded.anchor_balance,
      balance_anchor_date = excluded.balance_anchor_date,
      first_payment_date = excluded.first_payment_date,
      first_payment_amount = excluded.first_payment_amount,
      updated_at = now()
    returning * into v_terms;
  end if;

  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'terms', to_jsonb(v_terms)
  );
end;
$$;

comment on function public.save_debt_plan(
  uuid, text, uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, date, numeric, boolean, boolean
) is
  'Atomically creates or updates an active debt plan and its amortization terms.';

revoke all on function public.save_debt_plan(
  uuid, text, uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, date, numeric, boolean, boolean
) from public, anon;
grant execute on function public.save_debt_plan(
  uuid, text, uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, date, numeric, boolean, boolean
) to authenticated;
