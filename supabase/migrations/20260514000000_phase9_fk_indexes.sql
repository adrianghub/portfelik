-- Phase 9 perf advisor: FK-covering indexes for sequential-scan FKs.
-- Audit ref: docs/architecture/audit-2026-05-09.md (perf advisor).
-- All idempotent via `if not exists` - safe to re-run.

create index if not exists idx_group_invitations_invited_user_id
  on group_invitations (invited_user_id);

create index if not exists idx_shopping_lists_category_id
  on shopping_lists (category_id);

create index if not exists idx_transactions_shopping_list_id
  on transactions (shopping_list_id);

-- transactions_recurring_template_id_fkey only has a partial composite
-- index (user_id, recurring_template_id) WHERE NOT NULL - adequate for
-- the dedup query, but the FK constraint itself uses a plain lookup on
-- recurring_template_id that the partial/composite index does not cover.
create index if not exists idx_transactions_recurring_template_id
  on transactions (recurring_template_id)
  where recurring_template_id is not null;
