-- Preserve shared-plan audit history when the user who performed an action
-- deletes their account. The financial rows still belong to the plan and
-- transaction; created_by is attribution metadata and may therefore become
-- unknown after account deletion.

alter table public.plan_transaction_links
  alter column created_by drop not null;

alter table public.plan_transaction_links
  drop constraint if exists plan_transaction_links_created_by_fkey;

alter table public.plan_transaction_links
  add constraint plan_transaction_links_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete set null;

comment on column public.plan_transaction_links.created_by is
  'User who created the link. Null after that account is deleted.';

alter table public.plan_progress_snapshots
  alter column created_by drop not null;

alter table public.plan_progress_snapshots
  drop constraint if exists plan_progress_snapshots_created_by_fkey;

alter table public.plan_progress_snapshots
  add constraint plan_progress_snapshots_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete set null;

comment on column public.plan_progress_snapshots.created_by is
  'User who recorded the balance anchor. Null after that account is deleted.';
