-- Debt schedule needs a first-payment date (odd first period) and an optional
-- explicit first installment (loan agreement value, e.g. refinance 3115.38).
-- start_date stays as disbursement (drives bucketing); first_payment_date drives the schedule.

alter table public.plan_debt_terms
  add column if not exists first_payment_date date,
  add column if not exists first_payment_amount numeric(12, 2)
    check (first_payment_amount is null or first_payment_amount > 0);

comment on column public.plan_debt_terms.first_payment_date is
  'Date of the first installment; schedule rows start here. Null falls back to plans.start_date.';
comment on column public.plan_debt_terms.first_payment_amount is
  'Explicit first installment (odd first period). Null falls back to monthly_payment.';

-- Backfill existing rows: first payment = plan start_date.
update public.plan_debt_terms t
   set first_payment_date = p.start_date
  from public.plans p
 where p.id = t.plan_id
   and t.first_payment_date is null;

grant update (first_payment_date, first_payment_amount)
  on table public.plan_debt_terms to authenticated;
