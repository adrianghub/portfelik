-- Index cleanup: add missing FK covers, drop one redundant duplicate
--
-- Closes prod advisor findings (verified 2026-05-24):
--   * `unindexed_foreign_keys` (10 FKs on bank-import + categorization_rules)
--   * one truly-redundant duplicate transactions index
--
-- Deliberately conservative on drops. The advisor also reports ~11 other
-- indexes as `unused`, but on a low-volume DB `idx_scan = 0` means "not scanned
-- yet" (planner prefers seq scan on tiny tables), NOT "useless". Each of those
-- either covers a foreign key (dropping it would re-open an unindexed_foreign_keys
-- warning) or backs a real query shape that will be used at scale:
--   * idx_shopping_lists_{category_id,user_updated,group_user_updated,
--     status_updated,status_completed_at} — list-grid + completion queries
--   * idx_shopping_list_items_list_id — items-by-list lookup (hot path)
--   * idx_group_invitations_{invited_user_id,created_by} + idx_user_groups_owner_id
--     — FK covers; dropping creates new unindexed FKs
--   * idx_categories_type_name — system-category lookup by type
--   * categorization_rules_user_priority_idx — backs the not-yet-shipped rules engine
-- These are intentionally retained. Do not "clean them up" on a future advisor
-- pass without first confirming real query traffic.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Drop the redundant duplicate.
--    idx_transactions_user_date_asc  = btree (user_id, date)
--    idx_transactions_user_date_desc = btree (user_id, date DESC)
--    A single btree on (user_id, date) is scannable in both directions, so it
--    serves ORDER BY date ASC and DESC equally. The _asc index is the one the
--    planner uses; the _desc index is pure duplication. Keep _asc, drop _desc.
-- ---------------------------------------------------------------------------
drop index if exists public.idx_transactions_user_date_desc;

-- ---------------------------------------------------------------------------
-- 2. Add covering indexes for the 10 unindexed foreign keys.
-- ---------------------------------------------------------------------------
create index if not exists idx_categorization_rules_category_id
  on public.categorization_rules (category_id);

create index if not exists idx_transaction_import_links_bank_account_id
  on public.transaction_import_links (bank_account_id);
create index if not exists idx_transaction_import_links_row_id
  on public.transaction_import_links (row_id);
create index if not exists idx_transaction_import_links_session_id
  on public.transaction_import_links (session_id);

create index if not exists idx_transaction_import_rows_duplicate_of
  on public.transaction_import_rows (duplicate_of);
create index if not exists idx_transaction_import_rows_selected_category_id
  on public.transaction_import_rows (selected_category_id);
create index if not exists idx_transaction_import_rows_selected_group_id
  on public.transaction_import_rows (selected_group_id);
create index if not exists idx_transaction_import_rows_suggested_category_id
  on public.transaction_import_rows (suggested_category_id);
create index if not exists idx_transaction_import_rows_transaction_id
  on public.transaction_import_rows (transaction_id);

create index if not exists idx_transaction_import_sessions_bank_account_id
  on public.transaction_import_sessions (bank_account_id);
