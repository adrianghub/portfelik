-- Phase 12+: bank CSV import schema (V1: mBank + ING).
--
-- Five new tables. ZERO new columns on transactions — that is the
-- privacy spine. Bank provenance (account, external id, fingerprint,
-- raw-row hash, session id) lives in owner-only transaction_import_links
-- so the shared transactions row never leaks bank metadata to group
-- members via transactions_with_category.
--
-- Hard dedupe ONLY via:
--   (user_id, bank_account_id, external_transaction_id) when bank
--     provides an op id
--   (user_id, bank_account_id, source_file_hash, source_row_index) for
--     same-file row idempotency
-- Fingerprint is recorded for UI-level probable-duplicate warnings only.
--
-- No client DELETE on bank_accounts / sessions / rows / links — history
-- is preserved. bank_accounts uses archived_at soft-delete instead.

-- ============================================================
-- bank_accounts
-- ============================================================

create table bank_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('mbank', 'ing')),
  label       text not null,
  currency    char(3) not null default 'PLN'
              check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index bank_accounts_user_kind_active_idx
  on bank_accounts(user_id, kind) where archived_at is null;

alter table bank_accounts enable row level security;

create policy "bank_accounts: read own"
  on bank_accounts for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "bank_accounts: insert own"
  on bank_accounts for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "bank_accounts: update own"
  on bank_accounts for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- DELETE not granted: clients must soft-archive via archived_at.

revoke update on table bank_accounts from authenticated;
grant update (label, currency, archived_at, updated_at)
  on table bank_accounts to authenticated;

create trigger set_bank_accounts_updated_at
  before update on bank_accounts
  for each row execute function handle_updated_at();

comment on table  bank_accounts is
  'Owner-only registry of bank sources for CSV import. Soft-archive via archived_at; no hard DELETE.';
comment on column bank_accounts.user_id is
  'Immutable from client (column-level GRANT excludes user_id).';

-- ============================================================
-- transaction_import_sessions
-- ============================================================

create table transaction_import_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  bank_account_id  uuid not null references bank_accounts(id) on delete restrict,
  source_filename  text,
  source_file_hash text not null,
  detected_kind    text not null,
  status           text not null default 'preview'
                   check (status in ('preview', 'committed', 'cancelled')),
  rows_total       int  not null default 0,
  rows_committed   int  not null default 0,
  rows_skipped     int  not null default 0,
  rows_duplicate   int  not null default 0,
  created_at       timestamptz not null default now(),
  committed_at     timestamptz
);

-- Same file → same session, but cancelled sessions don't block a fresh upload.
create unique index transaction_import_sessions_active_file_idx
  on transaction_import_sessions(user_id, bank_account_id, source_file_hash)
  where status <> 'cancelled';

alter table transaction_import_sessions enable row level security;

create policy "import_sessions: read own"
  on transaction_import_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "import_sessions: insert own"
  on transaction_import_sessions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "import_sessions: update own"
  on transaction_import_sessions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on table transaction_import_sessions from authenticated;
grant update (
  source_filename,
  status,
  rows_total,
  rows_committed,
  rows_skipped,
  rows_duplicate,
  committed_at
) on table transaction_import_sessions to authenticated;

comment on column transaction_import_sessions.user_id is
  'Immutable from client (column-level GRANT excludes user_id).';

-- ============================================================
-- transaction_import_rows
-- ============================================================

create table transaction_import_rows (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references transaction_import_sessions(id) on delete restrict,
  row_index             int  not null,
  posted_at             date not null,
  amount                numeric(12,2) not null check (amount > 0),
  type                  transaction_type not null,
  description           text not null,
  counterparty          text,
  currency              char(3) not null
                        check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  external_id           text,
  raw_row_hash          text not null,
  suggested_category_id uuid references categories(id) on delete set null,
  selected_category_id  uuid references categories(id) on delete set null,
  selected_group_id     uuid references user_groups(id) on delete set null,
  edited_description    text,
  decision              text not null default 'pending'
                        check (decision in ('pending', 'import', 'skip', 'duplicate')),
  duplicate_of          uuid references transactions(id) on delete set null,
  transaction_id        uuid references transactions(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (session_id, row_index)
);

create index transaction_import_rows_session_idx on transaction_import_rows(session_id);

alter table transaction_import_rows enable row level security;

create policy "import_rows: read own"
  on transaction_import_rows for select
  to authenticated
  using (exists (
    select 1 from transaction_import_sessions s
    where s.id = transaction_import_rows.session_id
      and s.user_id = (select auth.uid())
  ));

create policy "import_rows: insert own"
  on transaction_import_rows for insert
  to authenticated
  with check (exists (
    select 1 from transaction_import_sessions s
    where s.id = transaction_import_rows.session_id
      and s.user_id = (select auth.uid())
  ));

create policy "import_rows: update own"
  on transaction_import_rows for update
  to authenticated
  using (exists (
    select 1 from transaction_import_sessions s
    where s.id = transaction_import_rows.session_id
      and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from transaction_import_sessions s
    where s.id = transaction_import_rows.session_id
      and s.user_id = (select auth.uid())
  ));

revoke update on table transaction_import_rows from authenticated;
grant update (
  suggested_category_id,
  selected_category_id,
  selected_group_id,
  edited_description,
  decision,
  duplicate_of,
  transaction_id
) on table transaction_import_rows to authenticated;

-- ============================================================
-- transaction_import_links — RPC-write-only, owner-only SELECT
-- ============================================================

create table transaction_import_links (
  transaction_id          uuid primary key references transactions(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  bank_account_id         uuid not null references bank_accounts(id) on delete restrict,
  session_id              uuid not null references transaction_import_sessions(id) on delete restrict,
  row_id                  uuid not null references transaction_import_rows(id) on delete restrict,
  external_transaction_id text,
  source_file_hash        text not null,
  source_row_index        int  not null,
  fingerprint             text not null,
  created_at              timestamptz not null default now()
);

-- Hard dedupe via these two indexes only. Fingerprint alone is NOT a hard key.
create unique index transaction_import_links_external_idx
  on transaction_import_links(user_id, bank_account_id, external_transaction_id)
  where external_transaction_id is not null;

create unique index transaction_import_links_file_row_idx
  on transaction_import_links(user_id, bank_account_id, source_file_hash, source_row_index);

create index transaction_import_links_fingerprint_idx
  on transaction_import_links(user_id, fingerprint);

alter table transaction_import_links enable row level security;

-- Owner can SELECT (used by review UI for probable-duplicate warnings).
create policy "import_links: read own"
  on transaction_import_links for select
  to authenticated
  using (user_id = (select auth.uid()));

-- INSERT / UPDATE / DELETE intentionally not granted to authenticated.
-- Only the SECURITY DEFINER commit RPC writes here.
revoke insert, update, delete on table transaction_import_links from authenticated;

comment on table transaction_import_links is
  'Owner-only provenance for imported transactions. Writes are RPC-only (commit_import_session); SELECT is granted so the review UI can scan fingerprints for probable-duplicate warnings.';

-- ============================================================
-- categorization_rules
-- ============================================================

create type categorization_rule_kind as enum ('exact', 'contains', 'type', 'composite');

create table categorization_rules (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  kind               categorization_rule_kind not null,
  match_description  text,
  match_counterparty text,
  match_type         transaction_type,
  category_id        uuid not null references categories(id) on delete cascade,
  priority           int  not null default 0,
  created_at         timestamptz not null default now(),
  check (
    (kind = 'exact'     and (match_description is not null or match_counterparty is not null)) or
    (kind = 'contains'  and (match_description is not null or match_counterparty is not null)) or
    (kind = 'type'      and match_type is not null) or
    (kind = 'composite' and (
       (match_description is not null or match_counterparty is not null) and match_type is not null
    ))
  )
);

create index categorization_rules_user_priority_idx
  on categorization_rules(user_id, priority desc);

alter table categorization_rules enable row level security;

create policy "categorization_rules: read own"
  on categorization_rules for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "categorization_rules: insert own"
  on categorization_rules for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "categorization_rules: update own"
  on categorization_rules for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "categorization_rules: delete own"
  on categorization_rules for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke update on table categorization_rules from authenticated;
grant update (
  kind,
  match_description,
  match_counterparty,
  match_type,
  category_id,
  priority
) on table categorization_rules to authenticated;

comment on column categorization_rules.user_id is
  'Immutable from client (column-level GRANT excludes user_id).';
