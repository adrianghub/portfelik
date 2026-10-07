-- Retrying the same statement creates a new preview, never cancels committed
-- provenance. Keep a single active preview per file while allowing historical
-- committed attempts. Hard row/file and bank ID uniqueness in
-- transaction_import_links remains unchanged, including commit-time retries.
drop index public.transaction_import_sessions_active_file_idx;
create unique index transaction_import_sessions_active_file_idx
  on public.transaction_import_sessions(user_id, bank_account_id, source_file_hash)
  where status = 'preview';

comment on index public.transaction_import_sessions_active_file_idx is
  'One active preview per account/file; committed import attempts retain their provenance.';
