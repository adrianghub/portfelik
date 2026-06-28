# Database

Postgres 17 (Supabase Cloud, EU). Authoritative source of all application
state. Authorisation is enforced exclusively by RLS.

Product note: user-facing **Plans** use the first-class `plans` table plus
`plan_transaction_links`. Legacy shopping-list tables and `transactions.shopping_list_id`
are retired by `20260617000000_first_class_plans.sql`.

## ER diagram

```mermaid
erDiagram
    auth_users ||--o| profiles : "1:1"
    auth_users ||--o{ user_groups : owns
    auth_users ||--o{ group_members : joins
    auth_users ||--o{ group_invitations : "creates / receives"
    auth_users ||--o{ categories : "owns (NULL = system)"
    auth_users ||--o{ transactions : owns
    auth_users ||--o{ plans : owns
    auth_users ||--o{ notifications : receives
    auth_users ||--o{ push_subscriptions : has
    auth_users ||--o{ bank_accounts : owns
    auth_users ||--o{ categorization_rules : owns
    auth_users ||--o{ cash_positions : anchors
    auth_users ||--o{ net_worth_items : owns
    auth_users ||--o{ action_dismissals : dismisses

    user_groups ||--o{ group_members : has
    user_groups ||--o{ group_invitations : has
    user_groups ||--o{ plans : "scopes (nullable)"
    user_groups ||--o{ transaction_import_rows : "scopes review (nullable)"
    user_groups ||--o{ cash_positions : anchors
    user_groups ||--o{ recurring_occurrence_skips : "skips shared occurrences"

    categories ||--o{ transactions : tags
    categories ||--o{ plans : "tags (nullable)"
    categories ||--o{ transaction_import_rows : "suggests/selects (nullable)"
    categories ||--o{ categorization_rules : tags

    plans ||--o{ plan_transaction_links : settles
    plans ||--o| plan_debt_terms : "debt terms (1:1)"
    auth_users ||--o| financial_snapshots : "net-worth date"
    auth_users ||--o{ net_worth_items : "manual assets"
    plan_transaction_links }o--|| transactions : links

    transactions ||--o| transaction_import_links : "provenance (owner-only)"
    transactions ||--o{ transactions : "recurring template to occurrence"

    bank_accounts ||--o{ transaction_import_sessions : has
    bank_accounts ||--o{ transaction_import_links : tagged
    transaction_import_sessions ||--o{ transaction_import_rows : has
    transaction_import_sessions ||--o{ transaction_import_links : produced
    transaction_import_rows ||--o| transaction_import_links : commits_into

    auth_users {
        uuid id PK
        text email
    }
    profiles {
        uuid id PK_FK
        text email
        text name
        user_role role
        jsonb settings
        timestamptz created_at
        timestamptz last_login_at
        timestamptz updated_at
    }
    user_groups {
        uuid id PK
        text name
        uuid owner_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    group_members {
        uuid group_id PK_FK
        uuid user_id PK_FK
        text role
        timestamptz joined_at
    }
    group_invitations {
        uuid id PK
        uuid group_id FK
        text group_name
        text invited_user_email
        uuid invited_user_id FK_nullable
        invitation_status status
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }
    categories {
        uuid id PK
        text name
        transaction_type type
        uuid user_id FK_nullable
        timestamptz created_at
        timestamptz updated_at
    }
    transactions {
        uuid id PK
        numeric amount
        char currency
        text description
        timestamptz date
        transaction_type type
        transaction_status status
        uuid category_id FK
        uuid user_id FK
        bool is_recurring
        smallint recurring_day
        uuid recurring_template_id FK_nullable
        date recurring_occurrence_date
        date recurrence_end_date
        timestamptz created_at
        timestamptz updated_at
    }
    plans {
        uuid id PK
        text name
        text kind
        uuid user_id FK
        uuid group_id FK_nullable
        uuid category_id FK_nullable
        text status
        uuid refinanced_from_plan_id FK_nullable
        uuid replaced_by_plan_id FK_nullable
        numeric budget_amount
        numeric target_amount
        date start_date
        date end_date
        timestamptz created_at
        timestamptz updated_at
    }
    plan_debt_terms {
        uuid plan_id PK_FK
        numeric original_amount
        numeric current_balance
        numeric annual_rate
        numeric monthly_payment
        numeric anchor_balance
        date balance_anchor_date
        date first_payment_date
        numeric first_payment_amount
    }
    financial_snapshots {
        uuid user_id PK_FK
        date as_of_date
    }
    cash_positions {
        uuid id PK
        uuid owner_id FK_nullable
        uuid group_id FK_nullable
        numeric opening_amount
        date as_of_date
    }
    net_worth_items {
        uuid id PK
        uuid user_id FK
        text label
        numeric amount
        text currency
        int position
    }
    plan_transaction_links {
        uuid plan_id PK_FK
        uuid transaction_id PK_FK
        uuid created_by FK
        timestamptz created_at
    }
    notifications {
        uuid id PK
        uuid user_id FK
        text type
        text title
        text body
        jsonb data
        timestamptz read_at
        timestamptz created_at
    }
    push_subscriptions {
        uuid user_id PK_FK
        text endpoint PK
        text p256dh
        text auth
        text device_type
        text user_agent
        timestamptz created_at
        timestamptz last_used_at
    }
    bank_accounts {
        uuid id PK
        uuid user_id FK
        text kind
        text label
        char currency
        timestamptz archived_at
        timestamptz created_at
        timestamptz updated_at
    }
    transaction_import_sessions {
        uuid id PK
        uuid user_id FK
        uuid bank_account_id FK
        text source_filename
        text source_file_hash
        text detected_kind
        text status
        int rows_total
        int rows_committed
        int rows_skipped
        int rows_duplicate
        timestamptz created_at
        timestamptz committed_at
    }
    transaction_import_rows {
        uuid id PK
        uuid session_id FK
        int row_index
        date posted_at
        numeric amount
        transaction_type type
        text description
        text counterparty
        char currency
        text external_id
        text raw_row_hash
        uuid suggested_category_id FK_nullable
        uuid selected_category_id FK_nullable
        uuid selected_group_id FK_nullable
        text edited_description
        text decision
        uuid duplicate_of FK_nullable
        uuid transaction_id FK_nullable
        timestamptz created_at
    }
    transaction_import_links {
        uuid transaction_id PK_FK
        uuid user_id FK
        uuid bank_account_id FK
        uuid session_id FK
        uuid row_id FK
        text external_transaction_id
        text source_file_hash
        int source_row_index
        text fingerprint
        timestamptz created_at
    }
    categorization_rules {
        uuid id PK
        uuid user_id FK
        categorization_rule_kind kind
        text match_description
        text match_counterparty
        transaction_type match_type
        uuid category_id FK
        int priority
        timestamptz created_at
    }
    action_dismissals {
        uuid id PK
        uuid user_id FK
        text action_key
        timestamptz dismissed_until
    }
    recurring_occurrence_skips {
        uuid id PK
        uuid user_id FK
        uuid group_id FK_nullable
        uuid recurring_template_id FK
        uuid skipped_transaction_id FK_nullable
        uuid created_by FK
        date occurrence_date
    }
```

## Enums

| Enum                       | Values                                         |
| -------------------------- | ---------------------------------------------- |
| `user_role`                | `user`, `admin`                                |
| `transaction_type`         | `income`, `expense`                            |
| `transaction_status`       | `draft`, `upcoming`, `overdue`, `paid`         |
| `invitation_status`        | `pending`, `accepted`, `rejected`, `cancelled` |
| `categorization_rule_kind` | `exact`, `contains`, `type`, `composite`       |

## Tables

### `profiles`

Mirrors `auth.users` 1:1. Created by `handle_new_user` trigger on `auth.users` insert; email kept in sync by `handle_user_email_update` on `auth.users` update. The `role` column is **revoked from `authenticated`** (`UPDATE`); changes flow only through `assign_admin_role` / `revoke_admin_role` RPCs.

- **PK**: `id` (FK to `auth.users.id`, ON DELETE CASCADE).
- **RLS**: read own row or any row if caller `is_admin()`; update own row only (role column itself is locked at the privilege layer).

### `user_groups`

A logical sharing unit. Owner has full lifecycle control via RPCs. Direct writes are blocked by `using (false)` - all mutations go through `create_group`, `disband_group`, `transfer_group_ownership`.

- **PK**: `id`. **FK**: `owner_id` → `auth.users.id` (ON DELETE RESTRICT - must transfer or disband before deleting the user).
- **RLS read**: members, owner, or pending invitees (matched by JWT email).
- **RLS write**: blocked. Use RPCs.

### `group_members`

Join table between `user_groups` and `auth.users`. Compound PK; cascade-delete on either side.

- **RLS read**: members of the group can read the full roster.
- **RLS write**: blocked. Use `create_group`, `accept_invitation`, `leave_group`, `remove_group_member`, `disband_group`.
- **Role**: `owner` is derived from `user_groups.owner_id`; non-owner rows carry
  `member` or `co_owner`. Owners manage lifecycle/invites; co-owners can manage
  group-scoped transactions, plans, debt terms, and cash-position anchors.

### `group_invitations`

Tracks the invitation workflow. Email is the join key (the invitee may not yet have a Supabase account at invite time); `invited_user_id` is denormalised once known but not authoritative.

- **RLS read**: creator OR invitee-by-email OR group owner.
- **RLS write**: blocked. Use `invite_user`, `accept_invitation`, `reject_invitation`, `cancel_invitation`.
- Status flow: `pending` → `accepted | rejected | cancelled`.

### `categories`

Owner-scoped; `user_id IS NULL` denotes a **system category**, visible to every authenticated user. System categories are seeded from `supabase/seed.sql` (14 expense + 7 income).

- **PK**: `id`. **FK**: `user_id` → `auth.users.id` (nullable, ON DELETE CASCADE).
- **RLS read**: system, own, or group-shared (via the standard pair-of-`group_members` self-join).
- **RLS write own**: by owner. **RLS write system**: by admin only.
- **Indexes**: `idx_categories_user_name`, `idx_categories_type_name`.

### `transactions`

Core ledger. Amount is stored as a positive magnitude; sign is carried by
`type`. Currency defaults to `PLN`. Date is `timestamptz` (not `date`, despite
the name).

- **PK**: `id`. **FKs**: `category_id` (RESTRICT), `user_id` (CASCADE),
  optional `recurring_template_id` self-FK for materialized recurring
  occurrences.
- **CHECK**: `amount > 0`, `recurring_day BETWEEN 1 AND 31`.
- **Recurring fields**: template rows carry `is_recurring`, `recurring_day`,
  frequency fields, and optional `recurrence_end_date`; generated near-term rows
  carry `recurring_template_id` + `recurring_occurrence_date`.
- **RLS read**: own + group-shared. **RLS write**: creator for own rows; group
  owner/co-owner (`is_group_co_owner`) for group-scoped peer rows. Migration:
  `20260622000000_transaction_co_owner_writes.sql`.
- **Indexes**: `idx_transactions_user_date_asc`, `idx_transactions_category_user_date`, `idx_transactions_status_date`, `idx_transactions_recurring` (redundant `idx_transactions_user_date_desc` dropped in `20260530000000`; `idx_transactions_recurring_template` dropped with its column in `20260705000000`).

A view `transactions_with_category` joins to `categories` for display; the SvelteKit app reads this view in `fetchTransactions`.

### `plans`

First-class storage for user-facing **Plans**. A plan represents a future
financial intention over a required date period. Actual money comes from linked
history rows through `plan_transaction_links`.

- **PK**: `id`. **FKs**: `user_id` (CASCADE), `group_id` (SET NULL),
  `category_id` (SET NULL).
- **`kind`**: `save` (accumulation goals) or `debt` (loan repayment). No database
  default; callers must choose a kind. Migration:
  `20260718000000_remove_spend_plans.sql` removed the old budget/outflow
  `spend` kind.
- **`status`**: `active`, `refinanced`, or `closed`. Refinance links are stored
  in `refinanced_from_plan_id` / `replaced_by_plan_id`; non-active debt plans
  are excluded from live net worth and obligation math.
- **`budget_amount`**: retained nullable legacy column; unused by current UI.
- **`target_amount`**: required for `save`; optional payoff framing for `debt`.
  CHECK `target_amount > 0` when set.
- **`start_date`**, **`end_date`**, CHECK `end_date >= start_date`.
- **RLS read**: own or group-shared.
- **RLS write**: plan creator OR group owner/co-owner (`is_group_co_owner`) for
  group-scoped updates/deletes; any group member may still insert their own group plan.
  Settlement RPCs allow any group member to link/unlink when scopes match.
  Migration: `20260620000000_plan_co_owner_writes.sql`.
- **Indexes**: `idx_plans_user_updated`, `idx_plans_group_user_updated`,
  `idx_plans_start_end`, `idx_plans_user_kind`.

### `plan_debt_terms`

1:1 loan terms for `kind=debt` plans (hipoteka, auto, consumer credit).

- **PK/FK**: `plan_id` → `plans(id)` (CASCADE). Plan must have `kind=debt`.
- **Columns**: `original_amount`, `current_balance`, `annual_rate`,
  `monthly_payment`, optional snapshot anchor `anchor_balance` +
  `balance_anchor_date`, optional `first_payment_date` +
  `first_payment_amount` for odd opening installments. Vestigial `payment_day`
  and `anchor_transaction_id` were dropped in `20260704000000`.
- **CHECK**: `current_balance <= original_amount`; positive amounts/rate constraints.
- **RLS**: read via parent plan (owner or group member); insert/update/delete
  by plan creator or group owner/co-owner only. Migration:
  `20260620000000_plan_co_owner_writes.sql`.
- **Client simulation**: amortization and overpay vs invest compare run in
  `debt-amortization.ts` (monthly compounding v1; Belka 19% in scenario compare).

### `financial_snapshots`, `cash_positions`, `net_worth_items`

Net worth is split between a lightweight snapshot date, a derived cash anchor,
and free-form manual asset items.

- **`financial_snapshots`**: one row per user; keeps the manual assets'
  `as_of_date` for display/back-compat.
- **`cash_positions`**: one private owner or group row per scope. Stores
  `opening_amount` + `as_of_date`; live and forecast cash are computed in app
  code from paid/upcoming transaction rows. RLS: owner read/write for private
  rows, group members read, group co-owners write. Scope columns are immutable
  via trigger.
- **`net_worth_items`**: owner-entered assets (`label`, `amount`, `currency`,
  `position`). Cash is not stored here; it is derived from `cash_positions`.
- **Net worth**: client computes derived cash + manual asset items - live debt
  plan balances. Nothing stores the final net-worth total.

### `notifications`

In-app inbox plus the data row that drives every push. Phase 5.2 wired a trigger so that **every insert** here also fires the `send-push` Edge Function, fanning the row out as web-push to all of the user's `push_subscriptions`.

- **PK**: `id`. **FK**: `user_id` (CASCADE).
- **RLS read/update/delete**: own. **RLS insert**: blocked from clients (only triggers and Edge Functions create rows).
- `type` is the `notification_type` enum. Current product types include group invitations, transaction reminders/status changes, admin summaries, system notifications, and `bank_import_reminder`.
- **Indexes**: `notifications_user_id_created_at_idx`, `notifications_unread_idx`, plus `notifications_bank_import_reminder_window_key` to dedupe one import reminder per configured cadence window.

### `push_subscriptions`

VAPID web-push subscriptions, one row per `(user_id, endpoint)` pair. `p256dh` and `auth` are base64url-encoded subscriber keys. `last_used_at` is auto-bumped on every UPDATE by `bump_last_used_at`.

- **PK**: `(user_id, endpoint)`. **FK**: `user_id` (CASCADE).
- **RLS**: users manage their own rows.
- Stale rows are pruned by `send-push` when the upstream returns 404 or 410.

### `bank_accounts`

Owner-only registry of bank sources for CSV import. **Soft-archive only** - no DELETE granted to clients; `archived_at` retires an account while preserving dedupe + audit chains. One active account per `(user_id, kind)` enforced by partial unique index. `user_id` is column-level immutable (excluded from UPDATE grant).

- **PK**: `id`. **FK**: `user_id` → `auth.users.id` (CASCADE).
- **CHECK**: `kind in ('mbank', 'ing')`; `currency` uppercase 3-letter.
- **Index**: `bank_accounts_user_kind_active_idx` unique on `(user_id, kind) WHERE archived_at IS NULL`.
- **RLS read/insert/update**: own. **DELETE**: not granted.
- **Column GRANTs (UPDATE)**: `label`, `currency`, `archived_at`, `updated_at` only.

### `transaction_import_sessions`

One row per uploaded file. Status `preview` → `committed | cancelled`. Cancelled sessions don't block re-uploading the same file (partial unique index).

- **PK**: `id`. **FKs**: `user_id` (CASCADE), `bank_account_id` (RESTRICT).
- **CHECK**: `status in ('preview', 'committed', 'cancelled')`.
- **Index**: `transaction_import_sessions_active_file_idx` unique on `(user_id, bank_account_id, source_file_hash) WHERE status <> 'cancelled'`.
- **RLS read/insert/update**: own. **DELETE**: not granted.
- **Column GRANTs (UPDATE)**: `source_filename`, `status`, `rows_total`, `rows_committed`, `rows_skipped`, `rows_duplicate`, `committed_at`.

### `transaction_import_rows`

Per-row preview state inside a session. Decision drives commit behaviour. Client UPDATEs limited to mutable review fields.

- **PK**: `id`. **FKs**: `session_id` (RESTRICT), `suggested_category_id` (SET NULL), `selected_category_id` (SET NULL), `selected_group_id` (SET NULL), `duplicate_of` → `transactions(id)` (SET NULL), `transaction_id` → `transactions(id)` (SET NULL).
- **CHECK**: `amount > 0`; `decision in ('pending', 'import', 'skip', 'duplicate')`; `currency` uppercase 3-letter.
- **Constraint**: unique `(session_id, row_index)`.
- **Index**: `transaction_import_rows_session_idx` on `(session_id)`.
- **RLS read/insert/update**: own (via parent `transaction_import_sessions`).
- **Column GRANTs (UPDATE)**: `suggested_category_id`, `selected_category_id`, `selected_group_id`, `edited_description`, `decision`, `duplicate_of`, `transaction_id`.

### `transaction_import_links`

Owner-only provenance for each imported transaction. **RPC-write-only** - INSERT/UPDATE/DELETE revoked from `authenticated`; only `commit_import_session` writes here. SELECT is granted so the review UI can scan fingerprints for probable-duplicate warnings. The shared `transactions` row carries zero bank metadata - this isolation is the privacy spine.

- **PK**: `transaction_id` (1:1 with `transactions`, CASCADE).
- **FKs**: `user_id` (CASCADE), `bank_account_id` (RESTRICT), `session_id` (RESTRICT), `row_id` (RESTRICT).
- **Hard dedupe (unique)**: `transaction_import_links_external_idx` on `(user_id, bank_account_id, external_transaction_id) WHERE external_transaction_id IS NOT NULL`; `transaction_import_links_file_row_idx` on `(user_id, bank_account_id, source_file_hash, source_row_index)`.
- **Soft dedupe (non-unique)**: `transaction_import_links_fingerprint_idx` on `(user_id, fingerprint)` - fingerprint must NOT back a unique index (two legit transactions can share one).
- **RLS read**: own. **All writes**: revoked from `authenticated`.

### `plan_transaction_links`

Dedicated settlement links between first-class plans and imported/manual
history rows. This is the only current plan-to-transaction relation.

- `plan_id` referencing `plans(id)` (CASCADE)
- `transaction_id` referencing `transactions(id)`
- `created_by`
- `created_at`
- unique `(plan_id, transaction_id)`
- unique `transaction_id` so one transaction can settle at most one plan in this
  iteration

Clients call `link_plan_transaction` / `unlink_plan_transaction`; direct writes
are revoked. The RPCs authorize both sides, reject non-expense/income rows,
enforce private/group scope compatibility, and require the transaction date to
fall inside the plan period.

### `categorization_rules`

Per-user deterministic categorization rules consumed by the import review step. Four kinds (`exact`, `contains`, `type`, `composite`) with a kind-specific CHECK constraint ensuring the relevant match field is non-null. Evaluated in `priority DESC` order.

- **PK**: `id`. **FKs**: `user_id` (CASCADE), `category_id` → `categories(id)` (CASCADE).
- **CHECK**: kind-specific match-field presence - `exact`/`contains` require `match_description` or `match_counterparty`; `type` requires `match_type`; `composite` requires both a text match field AND `match_type`.
- **Index**: `categorization_rules_user_priority_idx` on `(user_id, priority DESC)`.
- **RLS read/insert/update/delete**: own.
- **Column GRANTs (UPDATE)**: `kind`, `match_description`, `match_counterparty`, `match_type`, `category_id`, `priority`.

### `action_dismissals`

Per-user memory for deterministic dashboard action cards. It is UI attention
state, not financial truth.

- **PK**: `id`. **FK**: `user_id` → `auth.users(id)` (CASCADE).
- **Unique**: `(user_id, action_key)`.
- **`dismissed_until`**: `NULL` means permanently hidden until the action key
  changes; a future timestamp is a snooze.
- **RLS read/insert/update/delete**: owner only.

### `recurring_occurrence_skips`

One-off skip memory for recurring occurrences. Deleting/skipping a materialized
or projected occurrence records the template/date slot so sync and forecast do
not recreate it.

- **FKs**: `user_id`, optional `group_id`, and recurring template id.
- **RLS read/insert**: owner or group co-owner for group-scoped skips; no client
  update/delete path is exposed.
- **Product rule**: a skip is scoped to one occurrence date. Ending or editing a
  whole series changes the template (`recurrence_end_date` / recurrence fields)
  instead.

## RLS strategy

Two patterns:

1. **Owner + group-shared read**, **owner or co-owner write for group-scoped rows** -
   used across `transactions`, `categories`, and `plans` depending on table maturity.
   Plain group members read shared rows and settle plans but do not edit peers'
   transactions or plans unless nominated co-owner. The read predicate is the
   standard pair-of-`group_members` self-join:

   ```sql
   user_id = (select auth.uid())
   or exists (
     select 1 from group_members gm1
     join group_members gm2 on gm1.group_id = gm2.group_id
     where gm1.user_id = (select auth.uid())
       and gm2.user_id = <table>.user_id
   )
   ```

   `auth.uid()` is always wrapped in `(select ...)` so Postgres evaluates it once per statement (initPlan optimisation), not once per row.

2. **No direct writes - RPC-only** - used on `user_groups`, `group_members`, `group_invitations`. Writes are blocked by:

   ```sql
   create policy "<table>: no direct writes"
     on <table> for all to authenticated
     using (false) with check (false);
   ```

   Mutations are exposed through SECURITY DEFINER RPCs that bypass RLS and enforce the business invariants (only the owner can disband, only the invitee can accept, etc.). Two SECURITY DEFINER helpers - `is_group_member()` and `is_group_owner()` - break the recursion that direct subqueries against `user_groups`/`group_members` produce inside RLS policies.

## Helper functions

All `LANGUAGE plpgsql STABLE`, all SECURITY DEFINER except where noted.

> **Execute hardening (`20260529000000`, `20260623000000`, `20260624000000`):** `EXECUTE` is revoked from `public`/`anon` on every `public` function, and internal trigger/cron functions are also revoked from `authenticated` (so they cannot be reached over PostgREST `/rpc/`). Only the client-callable RPC set + RLS helpers (`is_admin`, `is_group_member`, `is_group_owner`) are granted to `authenticated`. SECDEF functions pin `search_path`; `20260623000000` also pins the three `privacy_*` masking helpers and revokes client access to `seed_default_categories*`. Client `UPDATE` on `transactions` is column-scoped; `20260624000000` adds `recurrence_*` to the grant list.

| Function                       | Used by                                  | Notes                                                                       |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| `is_admin()`                   | RLS, RPCs                                | Reads `profiles.role` for caller.                                           |
| `is_group_member(group_id)`    | `plans` RLS                              | Breaks recursion.                                                           |
| `is_group_owner(group_id)`     | `group_invitations` RLS                  | Breaks recursion.                                                           |
| `handle_updated_at()`          | `BEFORE UPDATE` triggers on 7 tables     | Generic timestamp bump.                                                     |
| `handle_new_user()`            | `auth.users` insert trigger              | Creates `profiles` row.                                                     |
| `enforce_max_user_cap()`       | `auth.users` insert trigger              | Vault-gated production cap for new Auth users.                              |
| `handle_user_email_update()`   | `auth.users` update trigger              | Mirrors email change to `profiles`.                                         |
| `bump_last_used_at()`          | `push_subscriptions` BEFORE UPDATE       | Updates `last_used_at`.                                                     |
| `edge_functions_base_url()`    | DB hook helpers                          | Reads the environment-specific Edge Function base URL from Vault.           |
| `notify_on_group_invitation()` | `group_invitations` AFTER INSERT trigger | Inserts a notification if invitee exists in `auth.users`.                   |
| `notify_on_role_change()`      | `profiles` AFTER UPDATE OF role trigger  | Inserts a notification on role change.                                      |
| `trigger_send_push()`          | `notifications` AFTER INSERT trigger     | `pg_net.http_post` to environment-configured `send-push` with Vault secret. |
| `trigger_sync_user_role()`     | `profiles` AFTER UPDATE OF role trigger  | `pg_net.http_post` to environment-configured `sync-user-role`.              |
| `trigger_admin_summary()`      | Admin-callable RPC                       | Manual fire of `send-admin-summary`.                                        |

## Domain RPCs

All SECURITY DEFINER (bypass RLS) unless marked SECURITY INVOKER. Defined in `20260423000000_initial_schema.sql` plus follow-on migrations.

**Groups (6)**

| RPC                                                    | Auth             | Behavior                                                   |
| ------------------------------------------------------ | ---------------- | ---------------------------------------------------------- |
| `create_group(p_name)`                                 | any user         | Creates group; adds caller as owner and member atomically. |
| `leave_group(p_group_id)`                              | non-owner member | Errors if caller is owner.                                 |
| `transfer_group_ownership(p_group_id, p_new_owner_id)` | current owner    | New owner must already be a member.                        |
| `disband_group(p_group_id)`                            | owner            | Cascades to members and invitations.                       |
| `remove_group_member(p_group_id, p_user_id)`           | owner            | Cannot remove self.                                        |
| `invite_user(p_group_id, p_email)`                     | owner            | Validates no duplicate pending invite; lower-cases email.  |

**Invitations (3)**

| RPC                                  | Auth                   | Behavior                                                   |
| ------------------------------------ | ---------------------- | ---------------------------------------------------------- |
| `accept_invitation(p_invitation_id)` | invitee (email match)  | Atomically inserts `group_members` row and updates status. |
| `reject_invitation(p_invitation_id)` | invitee                | Sets status `rejected`.                                    |
| `cancel_invitation(p_invitation_id)` | creator OR group owner | Sets status `cancelled`.                                   |

**Plans (2)**

| RPC                                             | Auth                              | Behavior                                                                                                                                          |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link_plan_transaction(p_plan_id, p_tx_id)`     | visible plan + visible tx         | Links one expense or income transaction to one plan. Enforces private/group scope, one-plan-per-transaction, and the plan date period.             |
| `unlink_plan_transaction(p_plan_id, p_tx_id)`   | visible plan + visible linked tx  | Removes a settlement link after the same visibility/scope checks.                                                                                 |

**Notifications (2 - both SECURITY INVOKER)**

| RPC                                         | Behavior                |
| ------------------------------------------- | ----------------------- |
| `mark_notification_read(p_notification_id)` | Sets `read_at`.         |
| `mark_all_notifications_read()`             | Bulk update for caller. |

**Alerts (1)**

| RPC                               | Auth         | Behavior                                                                                                                                      |
| --------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `process_bank_import_reminders()` | service role | SECURITY DEFINER scheduled producer. Inserts `bank_import_reminder` rows for users who enabled the alert and have no recent committed import. |

**Admin (3)**

| RPC                            | Auth  | Behavior                                           |
| ------------------------------ | ----- | -------------------------------------------------- |
| `assign_admin_role(p_user_id)` | admin | Promotes target.                                   |
| `revoke_admin_role(p_user_id)` | admin | Cannot revoke self.                                |
| `trigger_admin_summary()`      | admin | Manually fires `send-admin-summary` Edge Function. |

**Admin diagnostics - masked cross-user reads (issue #81)**

`admin_masked_transaction_by_id` / `admin_masked_import_session_by_id` /
`admin_masked_user_context_by_id` are the only deliberate admin cross-user
financial reads. They return only masked/bucketed fields plus keyed-HMAC tokens
(pepper stored in Supabase Vault, never reaches the client) - never raw
financial or personal data. `fetch_admin_notifications` is likewise masked
(title/body → `[masked]`, returns `user_token` not raw `user_id`). No
`is_admin()` bypass RLS exists on `transactions` or import tables. See
[`docs/architecture/flows/admin-diagnostics-privacy.md`](flows/admin-diagnostics-privacy.md)
for the full model and threat scope.

**Account**

| RPC                | Auth | Behavior                               |
| ------------------ | ---- | -------------------------------------- |
| `delete_account()` | self | Errors if caller still owns any group. |

**Bank import (2)**

| RPC                                          | Auth          | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit_import_session(p_session_id)`        | session owner | SECURITY DEFINER. Rejects unless `status='preview'` and `rows_pending=0`. Validates ownership/account/category visibility/group membership/type-match. Per-row savepoint catches `unique_violation` from the hard-dedupe indexes and marks the row `duplicate` (with `duplicate_of`) without aborting the loop. Returns jsonb `{inserted, duplicates_preview, duplicates_commit, skipped, fingerprint_warnings:[{row_id, duplicate_of_transaction_id}]}`. Warning candidates include prior imported-link fingerprint matches and visible plan-linked transactions with exact amount/currency within ±3 days. Only writer of `transaction_import_links`. |
| `preview_fingerprint_warnings(p_session_id)` | session owner | SECURITY DEFINER, read-only. Pre-commit scan returning probable-duplicate warnings for the review UI (shape matches `commit_import_session.fingerprint_warnings`). Path A scans the caller's existing import-link fingerprints. Path B scans visible plan-linked transactions with exact amount/currency and tx date within posted date ±3 days.                                                                                                                                                                                                                                                                                                              |

**Reporting (1 - SECURITY INVOKER)**

| RPC                                            | Behavior                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_monthly_summary(p_year int, p_month int)` | Aggregates the caller's visible transactions by category for the given month; returns JSON `{total_income, total_expenses, net, categories[]}`. **Currently unused by the SPA** - `computeSummary(transactions)` runs client-side instead. Kept as an alternative path. |

## Triggers (summary)

| Trigger                             | Table                                                                                                   | Event                 | Action                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| `enforce_max_user_cap_trigger`      | `auth.users`                                                                                            | BEFORE INSERT         | `enforce_max_user_cap()`                              |
| `on_auth_user_created`              | `auth.users`                                                                                            | AFTER INSERT          | `handle_new_user()`                                   |
| `on_auth_user_email_updated`        | `auth.users`                                                                                            | AFTER UPDATE OF email | `handle_user_email_update()`                          |
| `set_updated_at`                    | profiles, user_groups, group_invitations, categories, plans, transactions                              | BEFORE UPDATE         | `handle_updated_at()`                                 |
| `group_invitations_notify`          | group_invitations                                                                                       | AFTER INSERT          | `notify_on_group_invitation()`                        |
| `profiles_role_change_notify`       | profiles                                                                                                | AFTER UPDATE OF role  | `notify_on_role_change()`                             |
| `push_subscriptions_bump_last_used` | push_subscriptions                                                                                      | BEFORE UPDATE         | `bump_last_used_at()`                                 |
| `notifications_send_push`           | notifications                                                                                           | AFTER INSERT          | `trigger_send_push()` (calls `pg_net.http_post`)      |
| `profiles_role_change_sync`         | profiles                                                                                                | AFTER UPDATE OF role  | `trigger_sync_user_role()` (calls `pg_net.http_post`) |

## Scheduled jobs (`pg_cron`)

| Job                              | Cron (UTC)                                          | Action                                                                                                            |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `process-recurring-transactions` | `0 23 * * *` (daily 23:00 UTC)                      | Reminder-only since `20260703000000`: sends `transaction_reminder` notifications for templates due today/tomorrow; never inserts transaction rows. Dedup keyed on template id + occurrence date. |
| `update_transaction_statuses`    | `0 5 * * *` (daily 05:00 UTC)                       | Flips `status` based on `date` vs `now()`.                                                                        |
| `process-bank-import-reminders`  | `0 8 * * *` (daily 08:00 UTC)                       | Creates user-enabled reminders to upload a fresh bank CSV when the latest committed import is older than cadence. |
| `send-admin-summary` dispatch    | `0 7 * * *` (daily 07:00 UTC; sends on Warsaw Mon or day after import reminder) | `pg_net.http_post` → `send-admin-summary` Edge Function with Vault Bearer. |

DST drift is acknowledged: pg_cron runs on UTC, so the local-Warsaw fire time shifts by one hour around DST transitions.

## Migration Source Of Truth

The canonical migration history is the ordered SQL in `supabase/migrations/`.
Do not maintain a hand-written migration timeline in docs; it drifts quickly.
Use the guarded inspection/repair flow in the
[Supabase operations runbook](../runbooks/supabase-operations.md). Never apply
remote schema out-of-band; branch merges and reviewed migrations are the only
normal path that mutates remote schema.

## Extensions installed

`plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, **`pg_cron`**, **`pg_net`**, **`supabase_vault`**.

## Open issues

See the **[audit report](./audit-2026-05-09.md)** for the prioritised list (function `search_path` warnings, two unwrapped `auth.jwt()` calls in RLS policies, four unindexed FKs, several unused indexes, multiple permissive policies, and the offline-write-queue parity gap).

---

_Last reviewed: 2026-05-25 (see [`PRODUCT_REVIEW_2026-05-25.md`](../PRODUCT_REVIEW_2026-05-25.md))._
