-- Drop vestigial plan_debt_terms columns.
--
-- anchor_transaction_id: written by the debt-payment detect banner's confirm
-- button, read by nothing except that banner's own hide-condition. The banner
-- now performs a real settlement link (plan_transaction_links) instead, so the
-- column is dead. payment_day: stored and round-tripped by the terms form but
-- never settable in any UI nor read by any balance/scenario logic.
--
-- Column-restricted UPDATE grants referencing these columns (20260618) are
-- removed automatically with the columns.

alter table public.plan_debt_terms
  drop column if exists anchor_transaction_id,
  drop column if exists payment_day;
