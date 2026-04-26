-- =============================================================================
-- Portfelik — Initial Schema
-- Migration: 20260423000000_initial_schema
--
-- Design decisions recorded:
--   - All RLS policies wrap auth.uid() in (select auth.uid()) for initPlan
--     optimisation (Supabase lint: 0003_auth_rls_initplan)
--   - Group sharing via group_members join table (replaces Firestore memberIds[])
--   - Shopping list items in child table (not jsonb) for partial updates + Realtime
--   - Hard deletes on transactions (KISS)
--   - System categories: user_id IS NULL, visible to all authenticated users
--   - All group write operations go through SECURITY DEFINER RPCs
--   - profiles.role protected via column-level REVOKE; changed only by RPCs
--   - FK delete behaviours:
--       user_groups.owner_id        → RESTRICT  (must transfer/disband first)
--       group_members.user_id       → CASCADE   (auto-removed on account delete)
--       transactions.user_id        → CASCADE
--       categories.user_id          → CASCADE
--       shopping_lists.user_id      → CASCADE
--       shopping_lists.group_id     → SET NULL  (list becomes private, not deleted)
--       transactions.shopping_list_id → SET NULL
--       group_invitations.invited_user_id → SET NULL
-- =============================================================================


-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid() on older PG
create extension if not exists "pg_cron";    -- scheduled jobs (processRecurring etc.)


-- =============================================================================
-- SECTION 2: ENUM TYPES
-- =============================================================================

create type user_role as enum ('user', 'admin');

create type transaction_type as enum ('income', 'expense');

create type transaction_status as enum ('draft', 'upcoming', 'overdue', 'paid');

create type shopping_list_status as enum ('active', 'completed');

create type invitation_status as enum ('pending', 'accepted', 'rejected', 'cancelled');


-- =============================================================================
-- SECTION 3: HELPER FUNCTIONS (no table dependencies)
-- is_admin() and is_group_member() reference tables so are defined in
-- Section 5, after all tables exist. Only handle_updated_at() is safe here.
-- =============================================================================

-- Generic updated_at trigger function — applied to every mutable table.
create or replace function handle_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- SECTION 4: TABLE DEFINITIONS
-- (is_admin and is_group_member are defined in Section 5.5, after these tables)
-- (in FK dependency order)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1  profiles
-- 1:1 with auth.users. Populated automatically by trigger on user creation.
-- email is denormalized here (also in auth.users) so application queries can
-- filter/display email without touching the protected auth schema.
-- -----------------------------------------------------------------------------
create table profiles (
  id             uuid        primary key references auth.users(id) on delete cascade,
  email          text        not null,
  name           text,
  role           user_role   not null default 'user',
  settings       jsonb       not null default '{"notificationsEnabled": false}',
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table  profiles                   is 'Application-level user data, 1:1 with auth.users.';
comment on column profiles.role              is 'Only writable via assign_admin_role / revoke_admin_role RPCs.';
comment on column profiles.settings          is 'User preferences as JSON. Schema: {notificationsEnabled: boolean}.';


-- -----------------------------------------------------------------------------
-- 4.2  user_groups
-- owner_id uses RESTRICT so owners must transfer or disband groups before
-- deleting their account.
-- -----------------------------------------------------------------------------
create table user_groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  owner_id    uuid        not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table user_groups is 'Groups used for sharing transactions and shopping lists between users.';


-- -----------------------------------------------------------------------------
-- 4.3  group_members
-- Join table replacing the Firestore memberIds[] + memberEmails[] arrays.
-- user_id CASCADE: removing a user automatically removes their memberships.
-- group_id CASCADE: disbanding a group removes all memberships.
-- -----------------------------------------------------------------------------
create table group_members (
  group_id   uuid        not null references user_groups(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)  on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table group_members is 'Group membership join table. All writes go through RPCs.';


-- -----------------------------------------------------------------------------
-- 4.4  group_invitations
-- invited_user_id is NULL until the invitation is accepted (email-based matching).
-- group_id CASCADE: disbanding a group cancels all outstanding invitations.
-- created_by CASCADE: if the inviter deletes their account, the invitation goes too.
-- invited_user_id SET NULL: invitee account deletion doesn't destroy the record.
-- -----------------------------------------------------------------------------
create table group_invitations (
  id                   uuid              primary key default gen_random_uuid(),
  group_id             uuid              not null references user_groups(id) on delete cascade,
  group_name           text              not null,  -- denormalised for display without extra join
  invited_user_email   text              not null,  -- normalised to lowercase at insert
  invited_user_id      uuid              references auth.users(id) on delete set null,
  status               invitation_status not null default 'pending',
  created_by           uuid              not null references auth.users(id) on delete cascade,
  created_at           timestamptz       not null default now(),
  updated_at           timestamptz       not null default now()
);

comment on table  group_invitations                    is 'Invitations to join a group. Matched by email until accepted.';
comment on column group_invitations.invited_user_email is 'Stored lowercase. Matched against auth.jwt() ->> ''email'' in RPCs.';
comment on column group_invitations.invited_user_id    is 'NULL until the invited user accepts (set by accept_invitation RPC).';
comment on column group_invitations.group_name         is 'Denormalised copy of user_groups.name for display without a join.';


-- -----------------------------------------------------------------------------
-- 4.5  categories
-- user_id IS NULL → system category, visible to all authenticated users.
-- user_id NOT NULL → personal category, owner only can write.
-- -----------------------------------------------------------------------------
create table categories (
  id          uuid             primary key default gen_random_uuid(),
  name        text             not null,
  type        transaction_type not null,
  user_id     uuid             references auth.users(id) on delete cascade,  -- NULL = system
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now()
);

comment on table  categories         is 'Transaction categories. user_id IS NULL means system-wide default.';
comment on column categories.user_id is 'NULL = system category (admin-managed, read-only for users).';


-- -----------------------------------------------------------------------------
-- 4.6  shopping_lists
-- group_id SET NULL on group delete: list becomes private to the owner.
-- category_id SET NULL: category deletion does not destroy the list.
-- -----------------------------------------------------------------------------
create table shopping_lists (
  id            uuid                 primary key default gen_random_uuid(),
  name          text                 not null,
  status        shopping_list_status not null default 'active',
  user_id       uuid                 not null references auth.users(id)  on delete cascade,
  group_id      uuid                 references user_groups(id) on delete set null,
  category_id   uuid                 references categories(id)  on delete set null,
  total_amount  numeric(12, 2),      -- set by complete_shopping_list RPC
  created_at    timestamptz          not null default now(),
  updated_at    timestamptz          not null default now()
);

comment on table  shopping_lists              is 'Shopping lists. Optionally shared with a group via group_id.';
comment on column shopping_lists.group_id     is 'When set, all group members can read and write this list.';
comment on column shopping_lists.total_amount is 'Populated by complete_shopping_list RPC when status → completed.';


-- -----------------------------------------------------------------------------
-- 4.7  transactions
-- shopping_list_id SET NULL: deleting a list does not delete its transaction.
-- category_id RESTRICT: cannot delete a category that has transactions.
-- -----------------------------------------------------------------------------
create table transactions (
  id               uuid               primary key default gen_random_uuid(),
  amount           numeric(12, 2)     not null check (amount > 0),
  currency         char(3)            not null default 'PLN',
  description      text               not null,
  date             timestamptz        not null,
  type             transaction_type   not null,
  status           transaction_status not null default 'paid',
  category_id      uuid               not null references categories(id) on delete restrict,
  user_id          uuid               not null references auth.users(id)  on delete cascade,
  shopping_list_id uuid               references shopping_lists(id) on delete set null,
  is_recurring     boolean            not null default false,
  recurring_day    smallint           check (recurring_day between 1 and 31),
  created_at       timestamptz        not null default now(),
  updated_at       timestamptz        not null default now(),

  constraint recurring_day_required
    check (not is_recurring or recurring_day is not null)
);

comment on table  transactions                  is 'Financial transactions. Group members can read but not write each other''s transactions.';
comment on column transactions.currency         is 'ISO 4217 currency code. Defaults to PLN.';
comment on column transactions.shopping_list_id is 'Set when a transaction is created from completing a shopping list.';
comment on column transactions.recurring_day    is 'Day of month (1–31). Required when is_recurring = true.';


-- -----------------------------------------------------------------------------
-- 4.8  shopping_list_items
-- Child aggregate of shopping_lists. Inherits all access via parent RLS.
-- position allows ordered display and future drag-and-drop sorting.
-- -----------------------------------------------------------------------------
create table shopping_list_items (
  id               uuid        primary key default gen_random_uuid(),
  shopping_list_id uuid        not null references shopping_lists(id) on delete cascade,
  name             text        not null,
  completed        boolean     not null default false,
  quantity         numeric(10, 3),
  unit             text,
  position         smallint    not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  shopping_list_items          is 'Items within a shopping list. Access is governed by the parent list RLS.';
comment on column shopping_list_items.position is 'Display order. Lower = higher in list.';


-- =============================================================================
-- SECTION 5: TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1  Auth: create profile on new user
-- Fires after GoTrue inserts into auth.users (Google OAuth sign-up / first login).
-- raw_user_meta_data['full_name'] is populated by Google OAuth.
-- -----------------------------------------------------------------------------
create or replace function handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into profiles (id, email, name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;  -- idempotent: safe to fire multiple times
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- -----------------------------------------------------------------------------
-- 5.2  Auth: sync email change to profiles
-- Fires when GoTrue updates auth.users.email (e.g. user changes email in Google).
-- -----------------------------------------------------------------------------
create or replace function handle_user_email_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update profiles
  set email      = new.email,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function handle_user_email_update();


-- -----------------------------------------------------------------------------
-- 5.3  updated_at — applied to every mutable table
-- -----------------------------------------------------------------------------
create trigger set_updated_at before update on profiles
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on user_groups
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on group_invitations
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on categories
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on shopping_lists
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on transactions
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on shopping_list_items
  for each row execute function handle_updated_at();


-- =============================================================================
-- SECTION 5.5: HELPER FUNCTIONS (table-dependent)
-- Placed here because LANGUAGE SQL functions validate table references at
-- creation time — profiles and group_members must already exist.
-- =============================================================================

-- Returns true if the current authenticated user has the 'admin' role.
-- SECURITY DEFINER bypasses RLS on profiles to avoid recursive policy evaluation.
create or replace function is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Returns true if the current user is a member of the given group.
-- Used in RLS policies for shopping_lists and shopping_list_items.
-- SECURITY DEFINER bypasses RLS on group_members to keep policy logic simple.
create or replace function is_group_member(p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
  );
$$;


-- =============================================================================
-- SECTION 6: ROW LEVEL SECURITY
-- =============================================================================
-- Conventions used throughout:
--   (select auth.uid())   — initPlan wrap; evaluated once per statement, not per row
--   (select is_admin())   — same wrap for the SECURITY DEFINER helper
--   TO authenticated      — explicitly scoped; anon role gets nothing

-- -----------------------------------------------------------------------------
-- 6.1  profiles
-- -----------------------------------------------------------------------------
alter table profiles enable row level security;

-- Read own profile; admins can read all profiles (for user management panel)
create policy "profiles: authenticated users read own or admin reads all"
  on profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select is_admin())
  );

-- Update own profile; role column is separately protected by REVOKE below
create policy "profiles: users update own"
  on profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Inserts handled exclusively by the handle_new_user() trigger (service role).
-- No direct insert policy granted to authenticated role.

-- Deletes handled exclusively by delete_account() RPC (service role).
-- No direct delete policy granted to authenticated role.


-- -----------------------------------------------------------------------------
-- 6.2  user_groups
-- Read: member OR owner OR has a pending invitation (tighter than the original
--       Firestore rule which allowed any authenticated user with an email).
-- Writes: all via SECURITY DEFINER RPCs. Direct writes are blocked by policy.
-- -----------------------------------------------------------------------------
alter table user_groups enable row level security;

create policy "user_groups: members and owners can read"
  on user_groups for select
  to authenticated
  using (
    -- Is a current member
    exists (
      select 1 from group_members gm
      where gm.group_id = user_groups.id
        and gm.user_id = (select auth.uid())
    )
    -- Is the owner
    or owner_id = (select auth.uid())
    -- Has a pending invitation (invited user can see the group before joining)
    or exists (
      select 1 from group_invitations gi
      where gi.group_id  = user_groups.id
        and gi.invited_user_email = lower((select auth.jwt() ->> 'email'))
        and gi.status = 'pending'
    )
  );

-- Block all direct writes; RPCs use SECURITY DEFINER and bypass RLS.
create policy "user_groups: no direct writes"
  on user_groups for all
  to authenticated
  using (false)
  with check (false);


-- -----------------------------------------------------------------------------
-- 6.3  group_members
-- Read: any member of the group can see who else is in it.
-- Writes: blocked — all via RPCs.
-- -----------------------------------------------------------------------------
alter table group_members enable row level security;

create policy "group_members: members can read their group roster"
  on group_members for select
  to authenticated
  using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id  = (select auth.uid())
    )
  );

create policy "group_members: no direct writes"
  on group_members for all
  to authenticated
  using (false)
  with check (false);


-- -----------------------------------------------------------------------------
-- 6.4  group_invitations
-- Read: creator, invited user (by email), or group owner.
-- Writes: blocked — all via RPCs.
-- -----------------------------------------------------------------------------
alter table group_invitations enable row level security;

create policy "group_invitations: creator can read"
  on group_invitations for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy "group_invitations: invited user can read by email"
  on group_invitations for select
  to authenticated
  using (
    invited_user_email = lower((select auth.jwt() ->> 'email'))
  );

create policy "group_invitations: group owner can read"
  on group_invitations for select
  to authenticated
  using (
    exists (
      select 1 from user_groups ug
      where ug.id       = group_invitations.group_id
        and ug.owner_id = (select auth.uid())
    )
  );

create policy "group_invitations: no direct writes"
  on group_invitations for all
  to authenticated
  using (false)
  with check (false);


-- -----------------------------------------------------------------------------
-- 6.5  categories
-- Read: system categories (user_id IS NULL), own, or group-shared.
-- Write: own only; admins can manage system categories.
-- -----------------------------------------------------------------------------
alter table categories enable row level security;

create policy "categories: system categories visible to all authenticated"
  on categories for select
  to authenticated
  using (user_id is null);

create policy "categories: users read own"
  on categories for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "categories: users read group-shared"
  on categories for select
  to authenticated
  using (
    user_id in (
      select gm2.user_id
      from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = (select auth.uid())
        and gm2.user_id != (select auth.uid())
    )
  );

create policy "categories: users insert own"
  on categories for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "categories: users update own"
  on categories for update
  to authenticated
  using  (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "categories: users delete own"
  on categories for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Admins manage system categories (user_id IS NULL)
create policy "categories: admins insert system"
  on categories for insert
  to authenticated
  with check ((select is_admin()) and user_id is null);

create policy "categories: admins update system"
  on categories for update
  to authenticated
  using  ((select is_admin()) and user_id is null)
  with check ((select is_admin()) and user_id is null);

create policy "categories: admins delete system"
  on categories for delete
  to authenticated
  using ((select is_admin()) and user_id is null);


-- -----------------------------------------------------------------------------
-- 6.6  transactions
-- Read: own OR group-shared (via group_members self-join).
-- Write: own only — group members can READ but NOT modify each other's transactions.
-- (mirrors Firestore rules exactly)
-- -----------------------------------------------------------------------------
alter table transactions enable row level security;

create policy "transactions: users read own"
  on transactions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "transactions: users read group-shared"
  on transactions for select
  to authenticated
  using (
    user_id in (
      select gm2.user_id
      from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = (select auth.uid())
        and gm2.user_id != (select auth.uid())
    )
  );

create policy "transactions: users insert own"
  on transactions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "transactions: users update own"
  on transactions for update
  to authenticated
  using  (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "transactions: users delete own"
  on transactions for delete
  to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 6.7  shopping_lists
-- Read: own OR explicitly shared via group_id.
-- Write: own OR any group member (unlike transactions — matches Firestore rules).
-- -----------------------------------------------------------------------------
alter table shopping_lists enable row level security;

create policy "shopping_lists: users read own"
  on shopping_lists for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "shopping_lists: users read group-shared"
  on shopping_lists for select
  to authenticated
  using (
    group_id is not null
    and (select is_group_member(group_id))
  );

create policy "shopping_lists: users insert own"
  on shopping_lists for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Update: own list OR any group member of the associated group
create policy "shopping_lists: owner or group member can update"
  on shopping_lists for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and (select is_group_member(group_id)))
  )
  with check (
    user_id = (select auth.uid())
    or (group_id is not null and (select is_group_member(group_id)))
  );

-- Delete: own list OR any group member of the associated group
create policy "shopping_lists: owner or group member can delete"
  on shopping_lists for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and (select is_group_member(group_id)))
  );


-- -----------------------------------------------------------------------------
-- 6.8  shopping_list_items
-- Access entirely derived from the parent shopping_list.
-- Uses EXISTS subquery against shopping_lists to re-apply parent RLS semantics.
-- -----------------------------------------------------------------------------
alter table shopping_list_items enable row level security;

-- Reusable predicate: can the current user access the parent list?
-- Defined inline in each policy (no view trick needed at this scale).

create policy "shopping_list_items: select if parent accessible"
  on shopping_list_items for select
  to authenticated
  using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and (
          sl.user_id = (select auth.uid())
          or (sl.group_id is not null and (select is_group_member(sl.group_id)))
        )
    )
  );

create policy "shopping_list_items: insert if parent writable"
  on shopping_list_items for insert
  to authenticated
  with check (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and (
          sl.user_id = (select auth.uid())
          or (sl.group_id is not null and (select is_group_member(sl.group_id)))
        )
    )
  );

create policy "shopping_list_items: update if parent writable"
  on shopping_list_items for update
  to authenticated
  using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and (
          sl.user_id = (select auth.uid())
          or (sl.group_id is not null and (select is_group_member(sl.group_id)))
        )
    )
  );

create policy "shopping_list_items: delete if parent writable"
  on shopping_list_items for delete
  to authenticated
  using (
    exists (
      select 1 from shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and (
          sl.user_id = (select auth.uid())
          or (sl.group_id is not null and (select is_group_member(sl.group_id)))
        )
    )
  );


-- =============================================================================
-- SECTION 7: INDEXES
-- (derived from Firestore compound index audit + RLS query patterns)
-- =============================================================================

-- group_members — hot path for the group-sharing RLS subquery on transactions
-- and categories. Both directions indexed.
create index idx_group_members_user_id  on group_members(user_id);
create index idx_group_members_group_id on group_members(group_id);

-- transactions
create index idx_transactions_user_date_desc
  on transactions(user_id, date desc);

create index idx_transactions_user_date_asc
  on transactions(user_id, date asc);

create index idx_transactions_category_user_date
  on transactions(category_id, user_id, date desc);

create index idx_transactions_status_date
  on transactions(status, date asc);

-- Partial index for the recurring transaction job (only touches is_recurring=true)
create index idx_transactions_recurring
  on transactions(status, date)
  where is_recurring = true;

-- shopping_lists
create index idx_shopping_lists_user_updated
  on shopping_lists(user_id, updated_at desc);

create index idx_shopping_lists_group_user_updated
  on shopping_lists(group_id, user_id, updated_at desc);

create index idx_shopping_lists_status_updated
  on shopping_lists(status, updated_at desc);

-- shopping_list_items — foreign key lookup
create index idx_shopping_list_items_list_id
  on shopping_list_items(shopping_list_id);

create index idx_shopping_list_items_list_position
  on shopping_list_items(shopping_list_id, position);

-- categories
create index idx_categories_user_name
  on categories(user_id, name asc);

create index idx_categories_type_name
  on categories(type, name asc);

-- group_invitations
create index idx_group_invitations_created_by
  on group_invitations(created_by, created_at desc);

-- Hot path: "show my pending invitations" — matched by email
create index idx_group_invitations_email_status
  on group_invitations(invited_user_email, status, created_at desc);

create index idx_group_invitations_group_id
  on group_invitations(group_id);

-- user_groups
create index idx_user_groups_owner_id
  on user_groups(owner_id, created_at desc);


-- =============================================================================
-- SECTION 8: DOMAIN RPCs
-- All are SECURITY DEFINER (bypass RLS) and enforce business invariants
-- that cannot be expressed in plain RLS policies.
-- search_path = public is always set to prevent search_path injection.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 8.1  create_group(name)
-- Atomically creates a group and adds the caller as the first member/owner.
-- Mirrors Firestore canCreateGroup() invariant: owner must be in memberIds.
-- -----------------------------------------------------------------------------
create or replace function create_group(p_name text)
  returns user_groups
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_group user_groups;
begin
  insert into user_groups (name, owner_id)
  values (p_name, auth.uid())
  returning * into v_group;

  insert into group_members (group_id, user_id)
  values (v_group.id, auth.uid());

  return v_group;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.2  leave_group(group_id)
-- Non-owner members only. Mirrors Firestore canLeaveGroup() invariant.
-- -----------------------------------------------------------------------------
create or replace function leave_group(p_group_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not exists (
    select 1 from group_members
    where group_id = p_group_id
      and user_id  = auth.uid()
  ) then
    raise exception 'not_a_member'
      using errcode = 'P0001', hint = 'User is not a member of this group.';
  end if;

  if exists (
    select 1 from user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'owner_cannot_leave'
      using errcode = 'P0001',
            hint    = 'Transfer ownership or disband the group before leaving.';
  end if;

  delete from group_members
  where group_id = p_group_id
    and user_id  = auth.uid();
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.3  transfer_group_ownership(group_id, new_owner_id)
-- Current owner only. New owner must already be a member.
-- -----------------------------------------------------------------------------
create or replace function transfer_group_ownership(
  p_group_id     uuid,
  p_new_owner_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not exists (
    select 1 from user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from group_members
    where group_id = p_group_id
      and user_id  = p_new_owner_id
  ) then
    raise exception 'new_owner_not_member'
      using errcode = 'P0001',
            hint    = 'The new owner must already be a member of the group.';
  end if;

  update user_groups
  set owner_id   = p_new_owner_id,
      updated_at = now()
  where id = p_group_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.4  disband_group(group_id)
-- Owner only. Deletes the group; cascades to group_members and invitations.
-- Shopping lists with this group_id have group_id SET NULL (become private).
-- -----------------------------------------------------------------------------
create or replace function disband_group(p_group_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not exists (
    select 1 from user_groups
    where id       = p_group_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_group_owner'
      using errcode = 'P0001';
  end if;

  delete from user_groups where id = p_group_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.5  invite_user(group_id, email)
-- Group owner only. Validates no duplicate pending invitation.
-- Email is normalised to lowercase.
-- -----------------------------------------------------------------------------
create or replace function invite_user(p_group_id uuid, p_email text)
  returns group_invitations
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_email      text := lower(trim(p_email));
  v_group      user_groups;
  v_invitation group_invitations;
begin
  select * into v_group from user_groups where id = p_group_id;

  if v_group is null then
    raise exception 'group_not_found' using errcode = 'P0001';
  end if;

  if v_group.owner_id != auth.uid() then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  -- Invitee must not already be a member
  if exists (
    select 1
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
      and p.email     = v_email
  ) then
    raise exception 'already_a_member' using errcode = 'P0001';
  end if;

  -- No duplicate pending invitation
  if exists (
    select 1 from group_invitations
    where group_id           = p_group_id
      and invited_user_email = v_email
      and status             = 'pending'
  ) then
    raise exception 'invitation_already_pending' using errcode = 'P0001';
  end if;

  insert into group_invitations (group_id, group_name, invited_user_email, created_by)
  values (p_group_id, v_group.name, v_email, auth.uid())
  returning * into v_invitation;

  return v_invitation;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.6  accept_invitation(invitation_id)
-- Invited user only (email match). Atomically adds to group_members and
-- updates invitation status + sets invited_user_id.
-- -----------------------------------------------------------------------------
create or replace function accept_invitation(p_invitation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_invitation group_invitations;
  v_caller_email text := lower((select auth.jwt() ->> 'email'));
begin
  select * into v_invitation
  from group_invitations
  where id = p_invitation_id;

  if v_invitation is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;

  if v_invitation.invited_user_email != v_caller_email then
    raise exception 'email_mismatch'
      using errcode = 'P0001',
            hint    = 'This invitation was not sent to your email address.';
  end if;

  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending'
      using errcode = 'P0001',
            hint    = 'Invitation status: ' || v_invitation.status;
  end if;

  update group_invitations
  set status          = 'accepted',
      invited_user_id = auth.uid(),
      updated_at      = now()
  where id = p_invitation_id;

  -- Idempotent: ignore if already a member
  insert into group_members (group_id, user_id)
  values (v_invitation.group_id, auth.uid())
  on conflict (group_id, user_id) do nothing;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.7  reject_invitation(invitation_id)
-- Invited user only. Sets status → rejected.
-- -----------------------------------------------------------------------------
create or replace function reject_invitation(p_invitation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_invitation group_invitations;
begin
  select * into v_invitation from group_invitations where id = p_invitation_id;

  if v_invitation is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;

  if v_invitation.invited_user_email != lower((select auth.jwt() ->> 'email')) then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;

  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;

  update group_invitations
  set status = 'rejected', updated_at = now()
  where id = p_invitation_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.8  cancel_invitation(invitation_id)
-- Creator or group owner. Sets status → cancelled.
-- -----------------------------------------------------------------------------
create or replace function cancel_invitation(p_invitation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_invitation group_invitations;
begin
  select * into v_invitation from group_invitations where id = p_invitation_id;

  if v_invitation is null then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;

  if v_invitation.created_by != auth.uid()
    and not exists (
      select 1 from user_groups
      where id       = v_invitation.group_id
        and owner_id = auth.uid()
    )
  then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_invitation.status != 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;

  update group_invitations
  set status = 'cancelled', updated_at = now()
  where id = p_invitation_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.9  complete_shopping_list(list_id, total_amount, category_id)
-- Atomically marks a list as completed and creates the linked expense transaction.
-- The caller must be able to modify the list (owner or group member).
-- Returns the created transaction.
-- -----------------------------------------------------------------------------
create or replace function complete_shopping_list(
  p_list_id      uuid,
  p_total_amount numeric,
  p_category_id  uuid
)
  returns transactions
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_list        shopping_lists;
  v_transaction transactions;
begin
  select * into v_list from shopping_lists where id = p_list_id;

  if v_list is null then
    raise exception 'list_not_found' using errcode = 'P0001';
  end if;

  -- Authorisation: owner or group member
  if v_list.user_id != auth.uid()
    and not (
      v_list.group_id is not null
      and exists (
        select 1 from group_members
        where group_id = v_list.group_id
          and user_id  = auth.uid()
      )
    )
  then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_list.status = 'completed' then
    raise exception 'list_already_completed' using errcode = 'P0001';
  end if;

  if p_total_amount <= 0 then
    raise exception 'invalid_amount'
      using errcode = 'P0001', hint = 'total_amount must be greater than 0.';
  end if;

  -- Create linked expense transaction
  insert into transactions (
    amount, currency, description, date, type, status,
    category_id, user_id, shopping_list_id
  )
  values (
    p_total_amount,
    'PLN',
    v_list.name,
    now(),
    'expense',
    'paid',
    p_category_id,
    auth.uid(),
    p_list_id
  )
  returning * into v_transaction;

  -- Mark list as completed
  update shopping_lists
  set status       = 'completed',
      total_amount = p_total_amount,
      category_id  = p_category_id,
      updated_at   = now()
  where id = p_list_id;

  return v_transaction;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.10  delete_account()
-- Caller's own account. Blocks if caller owns any groups (must transfer/disband
-- first). On success, deletes from auth.users which cascades to profiles and
-- all user-owned rows.
-- -----------------------------------------------------------------------------
create or replace function delete_account()
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if exists (
    select 1 from user_groups where owner_id = auth.uid()
  ) then
    raise exception 'has_owned_groups'
      using errcode = 'P0001',
            hint    = 'Transfer ownership or disband all owned groups before deleting your account.';
  end if;

  -- Cascade: auth.users → profiles, transactions, categories,
  --          shopping_lists, group_members (all via ON DELETE CASCADE)
  delete from auth.users where id = auth.uid();
end;
$$;


-- -----------------------------------------------------------------------------
-- 8.11  assign_admin_role(user_id) / revoke_admin_role(user_id)
-- Admin-only. Intentionally checks is_admin() internally rather than relying
-- solely on RLS, since these functions are SECURITY DEFINER.
-- -----------------------------------------------------------------------------
create or replace function assign_admin_role(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not (select is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update profiles
  set role = 'admin', updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function revoke_admin_role(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not (select is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Prevent self-revocation (avoids accidental admin lockout)
  if p_user_id = auth.uid() then
    raise exception 'cannot_revoke_own_admin'
      using errcode = 'P0001',
            hint    = 'Ask another admin to revoke your role.';
  end if;

  update profiles
  set role = 'user', updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
end;
$$;


-- =============================================================================
-- SECTION 9: get_monthly_summary RPC
-- Replaces the Go BFF summary computation (~60 lines).
-- SECURITY INVOKER: RLS applies, so the function sees only transactions the
-- caller is allowed to see (own + group-shared).
-- Returns a single JSON object for clean PostgREST consumption.
-- =============================================================================

create or replace function get_monthly_summary(p_year int, p_month int)
  returns json
  language sql
  stable
  security invoker
  set search_path = public
as $$
  with period_transactions as (
    -- All visible transactions for the requested month (RLS filters automatically)
    -- Excludes drafts as they are not yet confirmed
    select
      t.id,
      t.amount,
      t.type,
      t.category_id,
      c.name as category_name,
      c.type as category_type
    from transactions t
    join categories c on c.id = t.category_id
    where extract(year  from t.date) = p_year
      and extract(month from t.date) = p_month
      and t.status != 'draft'
  ),
  totals as (
    select
      coalesce(sum(amount) filter (where type = 'income'),  0) as total_income,
      coalesce(sum(amount) filter (where type = 'expense'), 0) as total_expenses
    from period_transactions
  ),
  by_category as (
    select
      category_id,
      category_name,
      category_type,
      sum(amount)  as category_total,
      count(*)     as transaction_count
    from period_transactions
    group by category_id, category_name, category_type
  )
  select json_build_object(
    'total_income',   t.total_income,
    'total_expenses', t.total_expenses,
    'net',            t.total_income - t.total_expenses,
    'categories',     (
      select coalesce(
        json_agg(
          json_build_object(
            'category_id',       bc.category_id,
            'category_name',     bc.category_name,
            'type',              bc.category_type,
            'total',             bc.category_total,
            'percentage',        case
                                   when bc.category_type = 'expense' and t.total_expenses > 0
                                     then round((bc.category_total / t.total_expenses * 100)::numeric, 2)
                                   when bc.category_type = 'income' and t.total_income > 0
                                     then round((bc.category_total / t.total_income * 100)::numeric, 2)
                                   else 0
                                 end,
            'transaction_count', bc.transaction_count
          )
          order by bc.category_type, bc.category_total desc
        ),
        '[]'::json
      )
      from by_category bc
    )
  )
  from totals t;
$$;


-- =============================================================================
-- SECTION 10: VIEWS
-- =============================================================================

-- transactions_with_category
-- Denormalised read model for the transactions list UI.
-- security_invoker = true ensures RLS on the underlying transactions table
-- is enforced when queries hit this view (Postgres 15+).
create or replace view transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type
  from transactions t
  join categories   c on c.id = t.category_id;

comment on view transactions_with_category is
  'Read model joining transactions with category name and type. RLS from transactions applies.';


-- =============================================================================
-- SECTION 11: GRANTS AND COLUMN-LEVEL SECURITY
-- =============================================================================

-- Revoke role column from direct client updates.
-- profiles.role is only writable via assign_admin_role / revoke_admin_role RPCs
-- (both SECURITY DEFINER, which bypass column-level grants).
revoke update (role) on profiles from authenticated;

-- Grant execute on all public RPCs to authenticated users.
-- Admin-check RPCs (assign/revoke) enforce authorization internally.
grant execute on function is_admin                  to authenticated;
grant execute on function is_group_member           to authenticated;
grant execute on function create_group              to authenticated;
grant execute on function leave_group               to authenticated;
grant execute on function transfer_group_ownership  to authenticated;
grant execute on function disband_group             to authenticated;
grant execute on function invite_user               to authenticated;
grant execute on function accept_invitation         to authenticated;
grant execute on function reject_invitation         to authenticated;
grant execute on function cancel_invitation         to authenticated;
grant execute on function complete_shopping_list    to authenticated;
grant execute on function delete_account            to authenticated;
grant execute on function assign_admin_role         to authenticated;
grant execute on function revoke_admin_role         to authenticated;
grant execute on function get_monthly_summary       to authenticated;


-- =============================================================================
-- SECTION 12: REALTIME
-- Enable Postgres Changes publication on shopping_list_items.
-- Allows group members to receive real-time item check-off events
-- without polling, via supabase.channel().on('postgres_changes', ...).
-- =============================================================================

alter publication supabase_realtime add table shopping_list_items;
