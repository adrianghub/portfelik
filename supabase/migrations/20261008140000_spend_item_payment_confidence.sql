-- A payment date is an orientation until the user confirms it.
-- The old "reserved" status only meant "has a date". It is not a booking.
-- Drop the old checks before rewriting rows. "planned" is not allowed by the
-- previous status check, so an update-first migration fails when any row exists.

alter table public.plan_items
  drop constraint if exists plan_items_status_check;

alter table public.plan_items
  drop constraint if exists plan_items_estimated_without_date;

alter table public.plan_items
  drop constraint if exists plan_items_reserved_has_date;

update public.plan_items
set status = 'planned'
where status = 'reserved';

alter table public.plan_items
  add constraint plan_items_status_check
  check (status in ('estimated', 'planned', 'confirmed', 'cancelled'));

alter table public.plan_items
  add constraint plan_items_estimated_without_date
  check (status <> 'estimated' or due_date is null);

alter table public.plan_items
  add constraint plan_items_dated_status_has_date
  check (status not in ('planned', 'confirmed') or due_date is not null);

comment on column public.plan_items.status is
  'estimated: no date, not a due payment. planned: dated orientation, not yet an obligation. confirmed: the user confirmed the payment is due. cancelled: excluded from totals. None of these mean money has left an account. A booking is a later state.';
