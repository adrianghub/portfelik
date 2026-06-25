-- Persist "Pomiń" (dismiss) / snooze decisions on dashboard action cards.
-- Without storage, deterministic action suggestions (overdue, anomaly, settle-ready,
-- detected debt payment, …) reappear on every reload and re-nag the user.
--
-- Unlike plan_settlement_dismissals (plan-scoped, shared with group members), a
-- dashboard action is a personal decision-center item, so dismissals are scoped to
-- the acting user only. action_key is a stable, app-defined string (kind + entity id,
-- never a volatile date) so the same recurring condition maps to one row.
--
-- dismissed_until semantics:
--   null            -> permanent dismiss (hidden until the condition's key changes)
--   timestamptz > now -> snoozed; the action re-appears after dismissed_until.

create table public.action_dismissals (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  action_key      text        not null,
  dismissed_until timestamptz,
  created_at      timestamptz not null default now(),
  constraint action_dismissals_user_key_unique unique (user_id, action_key)
);

comment on table public.action_dismissals is
  'Per-user dismiss/snooze decisions for dashboard deterministic action cards. dismissed_until null = permanent, future timestamp = snooze.';

create index idx_action_dismissals_user_id
  on public.action_dismissals(user_id);

alter table public.action_dismissals enable row level security;

create policy "action_dismissals: owner select"
  on public.action_dismissals for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "action_dismissals: owner insert"
  on public.action_dismissals for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "action_dismissals: owner update"
  on public.action_dismissals for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "action_dismissals: owner delete"
  on public.action_dismissals for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Data API grants are not automatic for new public tables (Supabase 2026 rollout);
-- keep them narrow and explicit so `supabase db reset` replays them locally.
revoke all on table public.action_dismissals from public;
revoke all on table public.action_dismissals from anon;
grant select, insert, update, delete on table public.action_dismissals to authenticated;
