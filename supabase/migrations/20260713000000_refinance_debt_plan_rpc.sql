-- 20260713000000_refinance_debt_plan_rpc.sql
-- Make refinance atomic. Previously the client ran three separate requests
-- (insert new plan -> insert terms -> archive old plan); an interruption between
-- them could leave the replacement active WHILE the old loan stayed active,
-- double-counting the debt until manual cleanup. This wraps all three writes in
-- one transaction so it is all-or-nothing.
--
-- SECURITY INVOKER (default): every write is still enforced by the existing
-- plans / plan_debt_terms RLS policies under the caller's role, exactly like the
-- old direct-table path -- this only adds atomicity, no privilege change. The new
-- plan + terms are fresh inserts, so the partial-upsert "preserve first-payment"
-- logic in upsertPlanDebtTerms does not apply here.

create or replace function public.refinance_debt_plan(
  p_old_plan_id         uuid,
  p_name                text,
  p_group_id            uuid,
  p_category_id         uuid,
  p_target_amount       numeric,
  p_start_date          date,
  p_end_date            date,
  p_annual_rate         numeric,
  p_monthly_payment     numeric,
  p_first_payment_date  date,
  p_first_payment_amount numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  -- 1. New active debt plan, owned by the caller, linked back to the old loan.
  insert into public.plans (
    name, user_id, group_id, category_id, kind, target_amount,
    start_date, end_date, status, refinanced_from_plan_id
  ) values (
    p_name, auth.uid(), p_group_id, p_category_id, 'debt', p_target_amount,
    p_start_date, p_end_date, 'active', p_old_plan_id
  )
  returning id into v_new_id;

  -- 2. Fresh debt terms for the new plan (balance anchored at disbursement today,
  --    matching the upsertPlanDebtTerms fresh-insert behaviour).
  insert into public.plan_debt_terms (
    plan_id, original_amount, current_balance, annual_rate, monthly_payment,
    anchor_balance, balance_anchor_date, first_payment_date, first_payment_amount
  ) values (
    v_new_id, p_target_amount, p_target_amount, p_annual_rate, p_monthly_payment,
    p_target_amount, current_date, p_first_payment_date, p_first_payment_amount
  );

  -- 3. Archive the old loan and link the replacement. Guard on status = 'active'
  --    so a non-manageable id, a wrong id, or a double-refinance race matches no
  --    row and aborts the whole transaction (rolling back steps 1 and 2).
  update public.plans
     set status = 'refinanced', replaced_by_plan_id = v_new_id
   where id = p_old_plan_id
     and status = 'active';

  if not found then
    raise exception 'refinance_debt_plan: old plan % not active or not manageable', p_old_plan_id
      using errcode = 'check_violation';
  end if;

  return v_new_id;
end;
$$;

comment on function public.refinance_debt_plan(
  uuid, text, uuid, uuid, numeric, date, date, numeric, numeric, date, numeric
) is
  'Atomic debt refinance: creates the new active debt plan + terms, archives the old plan (status=refinanced, replaced_by_plan_id), all in one transaction. Writes no transactions (cash wash nets to zero). RLS-enforced (SECURITY INVOKER).';

revoke all on function public.refinance_debt_plan(
  uuid, text, uuid, uuid, numeric, date, date, numeric, numeric, date, numeric
) from public;
revoke all on function public.refinance_debt_plan(
  uuid, text, uuid, uuid, numeric, date, date, numeric, numeric, date, numeric
) from anon;
grant execute on function public.refinance_debt_plan(
  uuid, text, uuid, uuid, numeric, date, date, numeric, numeric, date, numeric
) to authenticated;
