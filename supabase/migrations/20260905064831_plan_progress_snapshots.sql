-- Manual goal balance corrections are financial metadata, not cash transactions.
-- They let a plan manager align the displayed saved amount without changing
-- spending, cash position, or current-month contribution pace.

create table public.plan_progress_snapshots (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.plans(id) on delete cascade,
  saved_amount   numeric(12, 2) not null check (saved_amount >= 0),
  effective_date date not null,
  note           text,
  created_by     uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint plan_progress_snapshots_note_length
    check (note is null or length(note) <= 240)
);

comment on table public.plan_progress_snapshots is
  'Auditable save-goal balance anchors. Never represents cash movement.';
comment on column public.plan_progress_snapshots.saved_amount is
  'Absolute saved balance at end of effective_date; only later linked payments add to it.';

create index idx_plan_progress_snapshots_plan_date
  on public.plan_progress_snapshots(plan_id, effective_date desc, created_at desc);

alter table public.plan_progress_snapshots enable row level security;

create policy "plan_progress_snapshots: select when plan visible"
  on public.plan_progress_snapshots for select
  to authenticated
  using (
    exists (
      select 1
      from public.plans p
      where p.id = plan_progress_snapshots.plan_id
        and (
          p.user_id = (select auth.uid())
          or (p.group_id is not null and (select public.is_group_member(p.group_id)))
        )
    )
  );

-- All writes go through the RPC below. No direct table writes are granted.
revoke all on table public.plan_progress_snapshots from public, anon;
grant select on table public.plan_progress_snapshots to authenticated;

create or replace function public.set_save_plan_progress(
  p_plan_id uuid,
  p_saved_amount numeric,
  p_effective_date date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans;
  v_snapshot_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_saved_amount is null or p_saved_amount < 0 then
    raise exception 'invalid_saved_amount' using errcode = 'P0001';
  end if;
  if p_effective_date is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  if p_note is not null and length(p_note) > 240 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  select * into v_plan
  from public.plans
  where id = p_plan_id
  for update;

  if v_plan is null or v_plan.kind <> 'save' then
    raise exception 'save_plan_not_found' using errcode = 'P0001';
  end if;
  if v_plan.status is distinct from 'active' then
    raise exception 'plan_not_active' using errcode = 'P0001';
  end if;
  if not (
    v_plan.user_id = v_uid
    or (
      v_plan.group_id is not null
      and public.is_group_co_owner(v_plan.group_id)
    )
  ) then
    raise exception 'not_authorized_plan' using errcode = 'P0001';
  end if;
  if p_effective_date < v_plan.start_date or p_effective_date > v_plan.end_date then
    raise exception 'snapshot_outside_plan_period' using errcode = 'P0001';
  end if;
  if p_effective_date > public.product_local_date() then
    raise exception 'snapshot_in_future' using errcode = 'P0001';
  end if;

  insert into public.plan_progress_snapshots (
    plan_id,
    saved_amount,
    effective_date,
    note,
    created_by
  ) values (
    p_plan_id,
    round(p_saved_amount, 2),
    p_effective_date,
    nullif(btrim(p_note), ''),
    v_uid
  )
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

comment on function public.set_save_plan_progress(uuid, numeric, date, text) is
  'Sets a save goal balance anchor without creating a cash transaction.';

revoke all on function public.set_save_plan_progress(uuid, numeric, date, text)
  from public, anon;
grant execute on function public.set_save_plan_progress(uuid, numeric, date, text)
  to authenticated;
